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
import { reviewsCache } from "~/.server/services/reviews/reviews-read.service";
import { authenticate } from "~/.server/shopify/shopify-app.config";
import { loader } from "~/routes/proxy/reviews.route";
import {
  createFakeJudge,
  PII_MARKERS,
  rawJudgeReview,
  rawJudgeReviews,
  type FakeJudge,
  type JudgeFailure,
} from "../../fakes/judge-api.fake";
import { OTHER_SHOP, SHOP } from "../../helpers/certificate-row.factory";
import { signedProxyUrlRequest } from "../../helpers/sign-proxy.utils";

const TOKEN = "route-test-token";
const OVERRIDE_DOMAIN = "override-shop.myshopify.com";
const LEAK_BODY = "LeakCheckBody sentence that must stay out of the logs.";
const LEAK_NAME = "LeakCheckName Reviewer";
const RESPONSE_KEYS = new Set([
  "reviews",
  "pagination",
  "page",
  "limit",
  "total",
  "total_pages",
  "id",
  "rating",
  "title",
  "body",
  "created_at",
  "reviewer_name",
  "verified",
  "source",
  "product",
  "handle",
]);

let logLines: LogLine[] = [];
let libraryFetch: AbstractFetchFunc;
let fake: FakeJudge;
let fetchSpy: MockInstance<typeof fetch>;

function arrangeJudge(options: {
  reviews?: unknown[];
  failure?: JudgeFailure;
}) {
  fake = createFakeJudge(options);
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(fake.fetch);
}

async function callReviews(request: Request): Promise<Response> {
  try {
    return await loader({
      request,
      url: new URL(request.url),
      pattern: "/proxy/reviews",
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

function reviewsRequest(
  parameters: Record<string, string> = {},
  options: { shop?: string; clientAddress?: string } = {},
): Request {
  return signedProxyUrlRequest({
    path: "/proxy/reviews",
    parameters,
    ...options,
  });
}

async function getReviews(
  parameters: Record<string, string> = {},
  options: { shop?: string; clientAddress?: string } = {},
) {
  const response = await callReviews(reviewsRequest(parameters, options));

  return { response, status: response.status, body: await response.json() };
}

function idsOf(body: { reviews: { id: number }[] }): number[] {
  return body.reviews.map((review) => review.id);
}

function linesOf(event: string): LogLine[] {
  return logLines.filter((line) => line.event === event);
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

function fetchedUrls(): URL[] {
  return fetchSpy.mock.calls.map(
    ([input]) => new URL(input instanceof Request ? input.url : String(input)),
  );
}

function shopLevelReviewer(name: string) {
  return { ...rawJudgeReview().reviewer, name };
}

function contractReviews(): unknown[] {
  return [
    rawJudgeReview({
      id: 900000002,
      rating: 5,
      body: "Great service.",
      created_at: "2026-10-20T09:15:00+00:00",
      reviewer: shopLevelReviewer(""),
      verified: "nothing",
      source: "google-business",
      product_external_id: 0,
      product_handle: "placeholder-handle",
      product_title: "Placeholder Title",
    }),
    rawJudgeReview({
      id: 900000001,
      rating: 5,
      body: "Arrived quickly and exactly as described.\nThe frame is superb.",
      created_at: "2026-10-29T18:52:50+00:00",
      product_external_id: 1234567890123,
      product_handle: "example-signed-shirt",
      product_title: "Example Signed Shirt",
    }),
    rawJudgeReview({
      id: 900000003,
      rating: 5,
      body: "   ",
      created_at: "2026-10-28T10:00:00+00:00",
    }),
    rawJudgeReview({
      id: 900000004,
      rating: 3,
      body: "Fine.",
      created_at: "2026-10-27T10:00:00+00:00",
    }),
  ];
}

function catalogReviews(): unknown[] {
  const catalog = [
    { productId: 111, handle: "alpha-shirt", rating: 5 },
    { productId: 111, handle: "alpha-shirt", rating: 3 },
    { productId: 222, handle: "beta-shirt", rating: 4 },
    { productId: 222, handle: "beta-shirt", rating: 5 },
    { productId: 0, handle: "placeholder-handle", rating: 2 },
    { productId: 111, handle: "alpha-shirt", rating: 1 },
  ];

  return rawJudgeReviews(catalog.length, (index) => ({
    rating: catalog[index].rating,
    product_external_id: catalog[index].productId,
    product_handle: catalog[index].handle,
  }));
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
  vi.stubEnv("JUDGE_API_TOKEN", TOKEN);
  vi.stubEnv("JUDGE_SHOP_DOMAIN", undefined);
  await prisma.session.create({
    data: {
      id: `offline_${SHOP}`,
      shop: SHOP,
      state: "",
      isOnline: false,
      scope: process.env.SCOPES,
      accessToken: "offline-test-token",
      expires: new Date(Date.now() + 3_600_000),
    },
  });
});

afterEach(() => {
  setLogSink(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  reviewsCache.clear();
});

describe("GET /proxy/reviews", () => {
  it("returns the contract shape for the signed shop, never cached or indexed", async () => {
    arrangeJudge({ reviews: contractReviews() });

    const { response, body } = await getReviews({
      sort: "rating",
      order: "desc",
      limit: "2",
      has_text: "1",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(idsOf(body)).toEqual([900000001, 900000002]);
    expect(Object.keys(body.reviews[0])).toEqual([
      "id",
      "rating",
      "title",
      "body",
      "created_at",
      "reviewer_name",
      "verified",
      "source",
      "product",
    ]);
    expect(body.pagination).toEqual({
      page: 1,
      limit: 2,
      total: 3,
      total_pages: 2,
    });
    // Serialised, so the snapshot keeps the wire order of the keys.
    expect(JSON.stringify(body, null, 2)).toMatchSnapshot();
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]).toMatchObject({
      shopDomain: SHOP,
      apiToken: TOKEN,
      perPage: 100,
      page: 1,
    });
  });

  it("defaults to 50 reviews per page", async () => {
    arrangeJudge({ reviews: rawJudgeReviews(60) });

    const first = await getReviews();
    const second = await getReviews({ page: "2" });

    expect(first.body.reviews).toHaveLength(50);
    expect(first.body.pagination).toEqual({
      page: 1,
      limit: 50,
      total: 60,
      total_pages: 2,
    });
    expect(second.body.reviews).toHaveLength(10);
    expect(second.body.pagination.page).toBe(2);
  });

  it.each([
    ["product_id", { product_id: "111" }, [300001, 300002, 300006]],
    [
      "product_handle",
      { product_handle: "Alpha-Shirt" },
      [300001, 300002, 300006],
    ],
    ["rating", { rating: "5" }, [300001, 300004]],
    ["min_rating", { min_rating: "4" }, [300001, 300003, 300004]],
    [
      "a product and min_rating",
      { product_id: "222", min_rating: "5" },
      [300004],
    ],
    [
      "sort=date&order=asc",
      { sort: "date", order: "asc" },
      [300006, 300005, 300004, 300003, 300002, 300001],
    ],
    [
      "sort=rating&order=desc",
      { sort: "rating", order: "desc" },
      [300001, 300004, 300003, 300002, 300005, 300006],
    ],
  ])("selects and orders by %s", async (_case, parameters, expectedIds) => {
    arrangeJudge({ reviews: catalogReviews() });

    const { status, body } = await getReviews(parameters);

    expect(status).toBe(200);
    expect(idsOf(body)).toEqual(expectedIds);
    expect(body.pagination.total).toBe(expectedIds.length);
  });

  it("answers an empty list for a product without reviews and never falls back", async () => {
    arrangeJudge({ reviews: catalogReviews() });

    const { status, body } = await getReviews({ product_id: "999" });

    expect(status).toBe(200);
    expect(body).toEqual({
      reviews: [],
      pagination: { page: 1, limit: 50, total: 0, total_pages: 0 },
    });
  });

  it("answers 200 for a shop with no reviews and loads from Judge once", async () => {
    arrangeJudge({ reviews: [] });

    const first = await getReviews();
    const second = await getReviews();

    expect(first.status).toBe(200);
    expect(first.body.reviews).toEqual([]);
    expect(second.status).toBe(200);
    expect(fake.requests).toHaveLength(1);
  });

  it("returns no reviewer data and no key outside the contract", async () => {
    arrangeJudge({ reviews: rawJudgeReviews(3) });

    const response = await callReviews(reviewsRequest());
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text).reviews).toHaveLength(3);

    for (const marker of PII_MARKERS) {
      expect(text).not.toContain(marker);
    }

    expect(
      allKeys(JSON.parse(text)).filter((key) => !RESPONSE_KEYS.has(key)),
    ).toEqual([]);
  });

  it("rejects a tampered query and a timestamp older than 90 seconds with 400", async () => {
    arrangeJudge({ reviews: rawJudgeReviews(3) });

    const tampered = await callReviews(
      signedProxyUrlRequest({
        path: "/proxy/reviews",
        parameters: { limit: "5" },
        tamper: { limit: "50" },
      }),
    );
    const stale = await callReviews(
      signedProxyUrlRequest({
        path: "/proxy/reviews",
        timestamp: Math.floor(Date.now() / 1000) - 91,
      }),
    );

    expect(tampered.status).toBe(400);
    expect(await tampered.text()).toBe("");
    expect(stale.status).toBe(400);
    expect(await stale.text()).toBe("");
    expect(fake.requests).toHaveLength(0);
  });

  it("limits a client address to 60 requests a minute per shop", async () => {
    arrangeJudge({ reviews: rawJudgeReviews(3) });
    const statuses: number[] = [];

    for (let hop = 1; hop <= 60; hop += 1) {
      const response = await callReviews(
        reviewsRequest({}, { clientAddress: `203.0.113.9, 10.0.0.${hop}` }),
      );
      statuses.push(response.status);
    }

    const judgeCallsBeforeLimit = fake.requests.length;

    reviewsCache.clear();

    const limited = await callReviews(
      reviewsRequest({}, { clientAddress: "203.0.113.9" }),
    );
    const limitedAgain = await callReviews(
      reviewsRequest({}, { clientAddress: "203.0.113.9" }),
    );

    expect(fake.requests).toHaveLength(judgeCallsBeforeLimit);

    const otherAddress = await callReviews(
      reviewsRequest({}, { clientAddress: "203.0.113.10" }),
    );
    const otherShop = await callReviews(
      reviewsRequest({}, { shop: OTHER_SHOP, clientAddress: "203.0.113.9" }),
    );

    expect(statuses).toEqual(Array(60).fill(200));
    expect(judgeCallsBeforeLimit).toBe(1);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
    expect(limited.headers.get("Cache-Control")).toBe("no-store");
    expect(await limited.json()).toEqual({ error: "rate_limited" });
    expect(limitedAgain.status).toBe(429);
    expect(otherAddress.status).toBe(200);
    expect(otherShop.status).toBe(200);
    expect(linesOf("reviews.rate_limited")).toEqual([
      {
        level: "warn",
        event: "reviews.rate_limited",
        shop: SHOP,
        time: expect.any(String),
      },
    ]);
    expect(JSON.stringify(logLines)).not.toContain("203.0.113");
  });

  it("rejects an invalid parameter without echoing the value or calling Judge", async () => {
    arrangeJudge({ reviews: rawJudgeReviews(3) });

    const response = await callReviews(reviewsRequest({ limit: "abc" }));
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(JSON.parse(text)).toEqual({
      error: "invalid_parameter",
      parameter: "limit",
    });
    expect(text).not.toContain("abc");
    expect(fake.requests).toHaveLength(0);
  });

  describe("when the reviews cannot be loaded", () => {
    it.each([
      ["a Judge 401", () => arrangeJudge({ failure: { status: 401 } }), 1],
      ["a Judge 500", () => arrangeJudge({ failure: { status: 500 } }), 1],
      [
        "a timeout",
        () => {
          vi.spyOn(AbortSignal, "timeout").mockReturnValue(
            AbortSignal.abort(new DOMException("timed out", "TimeoutError")),
          );
          arrangeJudge({ failure: { hang: true } });
        },
        1,
      ],
      [
        "an empty token",
        () => {
          vi.stubEnv("JUDGE_API_TOKEN", "");
          arrangeJudge({ reviews: rawJudgeReviews(3) });
        },
        0,
      ],
    ])(
      "answers 503 reviews_unavailable after %s",
      async (_case, arrange, expectedJudgeCalls) => {
        arrange();

        const { response, status, body } = await getReviews();

        expect(status).toBe(503);
        expect(body).toEqual({ error: "reviews_unavailable" });
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
        expect(fake.requests).toHaveLength(expectedJudgeCalls);
      },
    );

    it("serves the stale copy when Judge fails after the TTL", async () => {
      arrangeJudge({ reviews: rawJudgeReviews(3) });

      const warm = await getReviews();

      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(Date.now() + 300_001);
      fake.setFailure({ status: 500 });

      const stale = await getReviews();

      await vi.waitFor(() =>
        expect(linesOf("reviews.load_failed")).toHaveLength(1),
      );

      expect(stale.status).toBe(200);
      expect(stale.body).toEqual(warm.body);
      expect(fake.requests).toHaveLength(2);
      expect(linesOf("reviews.load_failed")[0]).toMatchObject({
        level: "warn",
        shop: SHOP,
        status: 500,
        servedStale: true,
      });
    });
  });

  describe("which shop Judge is asked for", () => {
    it("asks for the override domain when JUDGE_SHOP_DOMAIN is set", async () => {
      vi.stubEnv("JUDGE_SHOP_DOMAIN", OVERRIDE_DOMAIN);
      arrangeJudge({ reviews: rawJudgeReviews(3) });

      const { status } = await getReviews();

      expect(status).toBe(200);
      expect(fake.requests.map((request) => request.shopDomain)).toEqual([
        OVERRIDE_DOMAIN,
      ]);
    });

    it("asks for the signed shop when JUDGE_SHOP_DOMAIN is not set", async () => {
      arrangeJudge({ reviews: rawJudgeReviews(3) });

      const { status } = await getReviews({}, { shop: OTHER_SHOP });

      expect(status).toBe(200);
      expect(fake.requests.map((request) => request.shopDomain)).toEqual([
        OTHER_SHOP,
      ]);
    });
  });

  describe("without a usable Shopify session", () => {
    it("answers when the shop has no stored session", async () => {
      await prisma.session.deleteMany();
      arrangeJudge({ reviews: rawJudgeReviews(3) });

      const { status, body } = await getReviews();

      expect(status).toBe(200);
      expect(body.reviews).toHaveLength(3);
      expect(fetchedUrls().map((url) => url.hostname)).toEqual([
        "api.judge.me",
      ]);
    });

    it("answers when the token refresh fails", async () => {
      arrangeJudge({ reviews: rawJudgeReviews(3) });
      vi.spyOn(authenticate.public, "appProxy").mockRejectedValueOnce(
        new InvalidJwtError("expired"),
      );

      const { status, body } = await getReviews();

      expect(status).toBe(200);
      expect(body.reviews).toHaveLength(3);
      expect(linesOf("proxy.session_unavailable")).toEqual([
        {
          level: "warn",
          event: "proxy.session_unavailable",
          kind: "InvalidJwtError",
          time: expect.any(String),
        },
      ]);
      expect(fetchedUrls().map((url) => url.hostname)).toEqual([
        "api.judge.me",
      ]);
    });
  });

  it("logs no token, url, review text or reviewer name", async () => {
    vi.stubEnv("JUDGE_SHOP_DOMAIN", OVERRIDE_DOMAIN);
    arrangeJudge({
      reviews: [
        rawJudgeReview({
          body: LEAK_BODY,
          title: LEAK_BODY,
          reviewer: shopLevelReviewer(LEAK_NAME),
        }),
      ],
    });

    await getReviews();
    reviewsCache.clear();
    fake.setFailure({ status: 401 });
    await getReviews();

    const logged = JSON.stringify(logLines);

    expect(linesOf("reviews.loaded")).toHaveLength(1);
    expect(linesOf("reviews.load_failed")).toHaveLength(1);

    for (const secret of [
      TOKEN,
      "http",
      "api.judge.me",
      LEAK_BODY,
      LEAK_NAME,
      ...PII_MARKERS,
    ]) {
      expect(logged).not.toContain(secret);
    }
  });
});
