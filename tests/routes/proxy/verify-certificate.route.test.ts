import { InvalidJwtError } from "@shopify/shopify-api";
import {
  abstractFetch,
  setAbstractFetchFunc,
  type AbstractFetchFunc,
} from "@shopify/shopify-api/runtime";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import prisma from "~/.server/db/prisma.singleton";
import { setLogSink, type LogLine } from "~/.server/logging/logger.service";
import { loader } from "~/routes/proxy/verify-certificate.route";
import { authenticate } from "~/.server/shopify/shopify-app.config";
import { signedProxyQuery } from "../../../scripts/shared/proxy-signature.utils";
import {
  createCertificateRow,
  linkedWrite,
  OTHER_SHOP,
  SHOP,
} from "../../helpers/certificate-row.factory";
import { signedProxyRequest } from "../../helpers/sign-proxy.utils";

const FORBIDDEN_KEY =
  /order|line_?item|lineItem|^id$|product|metaobject|legacy/i;

let logLines: LogLine[] = [];
let libraryFetch: AbstractFetchFunc;

async function verify(request: Request): Promise<Response> {
  try {
    return await loader({
      request,
      url: new URL(request.url),
      pattern: "/proxy/verify",
      params: {},
      context: {},
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    throw error;
  }
}

async function verifyCode(code: string, shop?: string) {
  const response = await verify(signedProxyRequest({ code, shop }));

  return { status: response.status, body: await response.json() };
}

async function storeOfflineSession(
  overrides: { expires?: Date; refreshToken?: string } = {},
): Promise<void> {
  await prisma.session.create({
    data: {
      id: `offline_${SHOP}`,
      shop: SHOP,
      state: "",
      isOnline: false,
      scope: process.env.SCOPES,
      accessToken: "offline-test-token",
      expires: new Date(Date.now() + 3_600_000),
      ...overrides,
    },
  });
}

function allKeys(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(allKeys);
  }

  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => [
      key,
      ...allKeys(child),
    ]);
  }

  return [];
}

function fetchedUrls(fetchSpy: MockInstance<typeof fetch>): string[] {
  return fetchSpy.mock.calls.map(([input]) =>
    String(input instanceof Request ? input.url : input),
  );
}

beforeAll(() => {
  libraryFetch = abstractFetch;
  // The Shopify library keeps the fetch it found at import time. Routing it through
  // globalThis.fetch lets one spy see the library's calls as well as the app's.
  setAbstractFetchFunc((...fetchArguments) =>
    globalThis.fetch(...fetchArguments),
  );
});

afterAll(() => {
  setAbstractFetchFunc(libraryFetch);
});

beforeEach(async () => {
  logLines = [];
  setLogSink((line) => logLines.push(line));
  await storeOfflineSession();
});

afterEach(() => {
  setLogSink(null);
  vi.restoreAllMocks();
});

describe("GET /proxy/verify", () => {
  it("returns a known certificate in the legacy shape, never cached or indexed", async () => {
    await createCertificateRow({
      code: "IS141595MBRGFR",
      item: "Netherlands Home Shirt - 1988 Retro",
      notes: "Signed at two events.\nThe photo is from the first.",
      photoUrl:
        "https://cdn.shopify.com/s/files/1/0000/0001/files/netherlands-1988.png?v=1",
      photoFileId: "gid://shopify/MediaImage/41",
      signers: [
        {
          name: "Marco van Basten",
          date: { precision: "DAY", iso: "2023-11-21" },
          location: "Utrecht, Netherlands",
        },
        {
          name: "Ruud Gullit",
          date: { precision: "MONTH", iso: "2023-10" },
          location: "London, United Kingdom",
        },
        { name: "Frank Rijkaard", date: null, location: null },
      ],
    });

    const response = await verify(
      signedProxyRequest({ code: "IS141595MBRGFR" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(Object.keys(body.certificate)).toEqual([
      "certificate_verification",
      "signed",
      "shirt",
      "location",
      "date",
      "photo",
      "video",
      "notes",
      "signers",
    ]);
    // Serialised, so the snapshot keeps the wire order of the keys.
    expect(JSON.stringify(body, null, 2)).toMatchSnapshot();
    expect(logLines).toEqual([]);
  });

  it("returns no order, line item, id, product or file data for a linked certificate", async () => {
    const write = linkedWrite({
      productId: "gid://shopify/Product/7",
      productTitle: "Bayern Munich 2015-16 Home Shirt",
      productImageUrl: "https://cdn.shopify.com/s/files/product-7.png",
      videoUrl: "https://cdn.shopify.com/videos/c/o/v/bayern.mp4",
      videoFileId: "gid://shopify/Video/8",
    });
    await createCertificateRow(write);

    const response = await verify(signedProxyRequest({ code: write.code }));
    const text = await response.text();
    const body = JSON.parse(text);

    expect(body.found).toBe(true);
    expect(allKeys(body)).toContain("certificate_verification");
    expect(allKeys(body).filter((key) => FORBIDDEN_KEY.test(key))).toEqual([]);

    for (const stored of [
      write.orderName,
      write.lineItemTitle,
      write.orderId,
      write.lineItemId,
      write.productTitle,
      write.productImageUrl,
      "gid://",
    ]) {
      expect(stored).toBeTruthy();
      expect(text).not.toContain(stored);
    }
  });

  it("finds a code typed in lower case with spaces", async () => {
    await createCertificateRow({ code: "IS141909ARS0" });

    const { status, body } = await verifyCode(" is141909 ars0 ");

    expect(status).toBe(200);
    expect(body.found).toBe(true);
    expect(body.certificate.certificate_verification).toBe("IS141909ARS0");
  });

  it("reads only the first 64 characters of the code", async () => {
    await createCertificateRow({ code: "IS141909ARS0" });

    expect((await verifyCode(`${" ".repeat(52)}IS141909ARS0`)).body.found).toBe(
      true,
    );
    expect((await verifyCode(`${" ".repeat(64)}IS141909ARS0`)).body).toEqual({
      found: false,
    });
  });

  it("answers found: false for unknown, empty and malformed codes", async () => {
    await createCertificateRow({ code: "IS141909ARS0" });

    for (const code of [
      "IS141909ARS1",
      "",
      "   ",
      "IS14!909",
      "--",
      "ABC",
      `IS141909ARS0${"X".repeat(100)}`,
    ]) {
      const response = await verify(signedProxyRequest({ code }));

      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.json()).toEqual({ found: false });
    }
  });

  it("rejects a tampered code and a timestamp older than 90 seconds with 400", async () => {
    await createCertificateRow({ code: "IS141909ARS0" });

    const tampered = await verify(
      signedProxyRequest({
        code: "IS141909ARS1",
        tamper: { code: "IS141909ARS0" },
      }),
    );
    const stale = await verify(
      signedProxyRequest({
        code: "IS141909ARS0",
        timestamp: Math.floor(Date.now() / 1000) - 91,
      }),
    );

    expect(tampered.status).toBe(400);
    expect(await tampered.text()).toBe("");
    expect(stale.status).toBe(400);
    expect(await stale.text()).toBe("");
  });

  it("limits a client address to 20 lookups a minute per shop", async () => {
    await createCertificateRow({ code: "IS141909ARS0" });
    const statuses: number[] = [];

    for (let hop = 1; hop <= 20; hop += 1) {
      const response = await verify(
        signedProxyRequest({
          code: "IS141909ARS0",
          clientAddress: `203.0.113.9, 10.0.0.${hop}`,
        }),
      );
      statuses.push(response.status);
    }

    const limited = await verify(
      signedProxyRequest({
        code: "IS141909ARS0",
        clientAddress: "203.0.113.9",
      }),
    );
    const limitedAgain = await verify(
      signedProxyRequest({
        code: "IS141909ARS0",
        clientAddress: "203.0.113.9",
      }),
    );
    const otherAddress = await verify(
      signedProxyRequest({
        code: "IS141909ARS0",
        clientAddress: "203.0.113.10",
      }),
    );
    const otherShop = await verify(
      signedProxyRequest({
        code: "IS141909ARS0",
        shop: OTHER_SHOP,
        clientAddress: "203.0.113.9",
      }),
    );

    expect(statuses).toEqual(Array(20).fill(200));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
    expect(limited.headers.get("Cache-Control")).toBe("no-store");
    expect(await limited.json()).toEqual({
      found: false,
      error: "rate_limited",
    });
    expect(limitedAgain.status).toBe(429);
    expect(otherAddress.status).toBe(200);
    expect(otherShop.status).toBe(200);
    expect(logLines).toEqual([
      {
        level: "warn",
        event: "proxy.rate_limited",
        shop: SHOP,
        time: expect.any(String),
      },
    ]);
    expect(JSON.stringify(logLines)).not.toContain("203.0.113");
  });

  it("never returns another shop's certificate", async () => {
    await createCertificateRow({ code: "IS141777OTHR" }, { shop: OTHER_SHOP });

    expect((await verifyCode("IS141777OTHR")).body).toEqual({ found: false });
    expect((await verifyCode("IS141777OTHR", OTHER_SHOP)).body.found).toBe(
      true,
    );
  });

  it("answers from Postgres when the shop has no stored session", async () => {
    await prisma.session.deleteMany();
    await createCertificateRow({ code: "IS141909ARS0" });

    const { status, body } = await verifyCode("IS141909ARS0");

    expect(status).toBe(200);
    expect(body.found).toBe(true);
  });

  it.each([
    ["an invalid token", new InvalidJwtError("expired"), "InvalidJwtError"],
    ["a failed token refresh", new Response(null, { status: 500 }), "http_500"],
  ])("answers from Postgres after %s", async (_case, failure, kind) => {
    await createCertificateRow({ code: "IS141909ARS0" });
    vi.spyOn(authenticate.public, "appProxy").mockRejectedValueOnce(failure);

    const { status, body } = await verifyCode("IS141909ARS0");

    expect(status).toBe(200);
    expect(body.found).toBe(true);
    expect(logLines).toEqual([
      {
        level: "warn",
        event: "proxy.session_unavailable",
        kind,
        time: expect.any(String),
      },
    ]);
  });

  it("answers from Postgres when the library's refresh of an expired token is refused", async () => {
    await prisma.session.deleteMany();
    await storeOfflineSession({
      expires: new Date(Date.now() - 60_000),
      refreshToken: "offline-test-refresh-token",
    });
    await createCertificateRow({ code: "IS141909ARS0" });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        Response.json({ error: "invalid_subject_token" }, { status: 400 }),
      );

    const { status, body } = await verifyCode("IS141909ARS0");

    expect(status).toBe(200);
    expect(body.found).toBe(true);
    expect(fetchedUrls(fetchSpy)).toEqual([
      `https://${SHOP}/admin/oauth/access_token`,
    ]);
    expect(logLines).toEqual([
      {
        level: "warn",
        event: "proxy.session_unavailable",
        kind: "HttpResponseError",
        time: expect.any(String),
      },
    ]);
  });

  it("returns an empty photo while the uploaded file is still processing", async () => {
    await createCertificateRow({
      code: "IS141909ARS0",
      photoUrl: null,
      photoFileId: "gid://shopify/MediaImage/12",
    });

    const { body } = await verifyCode("IS141909ARS0");

    expect(body.certificate.photo).toBe("");
    expect(body.certificate.video).toBe("");
  });

  it("makes no Admin API call and logs nothing about the customer", async () => {
    await createCertificateRow({ code: "IS141909ARS0" });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("fetch failed"));
    const query = signedProxyQuery(
      {
        code: "IS141909ARS0",
        shop: SHOP,
        logged_in_customer_id: "7001",
        path_prefix: "/apps/coa",
        timestamp: String(Math.floor(Date.now() / 1000)),
      },
      process.env.SHOPIFY_API_SECRET ?? "",
    );

    const response = await verify(
      new Request(`${process.env.SHOPIFY_APP_URL}/proxy/verify?${query}`, {
        headers: { "X-Forwarded-For": "198.51.100.23" },
      }),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).found).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(logLines).toEqual([]);
  });
});
