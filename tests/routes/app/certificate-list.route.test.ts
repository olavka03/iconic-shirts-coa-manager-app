import type { LoaderFunctionArgs } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "~/.server/gateways/admin-graphql.gateway";
import type { CertificateListItem } from "~/features/certificates/types/certificates.types";
import { setLogSink, type LogLine } from "~/.server/logging/logger.service";
import { loader as certificatesLoader } from "~/routes/app/certificate-list-redirect.route";
import { loader as indexLoader } from "~/routes/app/certificate-list.route";
import { completePendingInBackground } from "~/.server/services/certificates/media-completion.service";
import { createFakeAdmin, type FakeAdmin } from "../../fakes/admin-api.fake";
import {
  createCertificateRow,
  OTHER_SHOP,
  SHOP,
} from "../../helpers/certificate-row.factory";

const auth = vi.hoisted(() => ({
  shop: "",
  admin: null as AdminClient | null,
}));

vi.mock("~/.server/shopify/shopify-app.config", () => ({
  authenticate: {
    admin: vi.fn(async () => ({
      admin: auth.admin,
      session: { shop: auth.shop },
      redirect: (location: string) =>
        new Response(null, { status: 302, headers: { Location: location } }),
    })),
  },
}));

vi.mock(
  "~/.server/services/certificates/media-completion.service",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/.server/services/certificates/media-completion.service")
    >()),
    completePendingInBackground: vi.fn(),
  }),
);

const LIST_ITEM_KEYS = [
  "code",
  "dateLabel",
  "id",
  "imageUrl",
  "item",
  "mediaFailed",
  "orderName",
  "proofLabel",
  "signedBy",
] satisfies (keyof CertificateListItem)[];

let fake: FakeAdmin;
let logs: LogLine[];

async function loadIndex(path: string) {
  return (await indexLoader(loaderArguments(path))).list;
}

function loaderArguments(path: string): LoaderFunctionArgs {
  const url = new URL(path, "https://app.test");

  return {
    request: new Request(url),
    url,
    pattern: url.pathname,
    params: {},
    context: {},
  };
}

async function createListRows(count: number): Promise<void> {
  const firstCreatedAt = Date.parse("2026-01-01T00:00:00Z");

  for (let index = 0; index < count; index += 1) {
    await createCertificateRow(
      {
        code: `LIST${String(index).padStart(2, "0")}`,
        notes: "Kept for the shop owner only",
      },
      { createdAt: new Date(firstCreatedAt + index * 60_000) },
    );
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  fake = createFakeAdmin();
  auth.admin = fake.client;
  auth.shop = SHOP;
  logs = [];
  setLogSink((line) => logs.push(line));
});

afterEach(() => {
  setLogSink(null);
});

describe("GET /app", () => {
  it("clamps a page past the end and maps the rows to list items", async () => {
    await createListRows(27);

    const result = await loadIndex("/app?page=9");

    expect(result).toMatchObject({ page: 2, pageCount: 2, total: 27 });
    expect(result.params.page).toBe(9);
    expect(result.rows.map((row) => row.code)).toEqual(["LIST01", "LIST00"]);

    for (const row of result.rows) {
      expect(Object.keys(row).sort()).toEqual(LIST_ITEM_KEYS);
    }

    expect(JSON.stringify(result.rows)).not.toContain(
      "Kept for the shop owner only",
    );
  });

  it("pages by the size in the URL", async () => {
    await createListRows(27);

    const result = await loadIndex("/app?perPage=10&page=3");

    expect(result).toMatchObject({ page: 3, pageCount: 3, total: 27 });
    expect(result.params.perPage).toBe(10);
    expect(result.rows).toHaveLength(7);
  });

  it("starts pending media completion once for the shop and calls no Admin API", async () => {
    await loadIndex("/app");

    expect(completePendingInBackground).toHaveBeenCalledTimes(1);
    expect(completePendingInBackground).toHaveBeenCalledWith(
      expect.objectContaining({ shop: SHOP, admin: fake.client }),
    );
    expect(fake.calls).toEqual([]);
  });

  it("logs the shop, the total and the database time without any code", async () => {
    await createListRows(1);

    await loadIndex("/app");

    expect(logs).toEqual([
      {
        level: "info",
        event: "page.index",
        time: expect.any(String),
        shop: SHOP,
        total: 1,
        dbMs: expect.any(Number),
      },
    ]);
  });

  it("finds nothing for an unmatched search in a shop that has certificates", async () => {
    await createListRows(1);

    const result = await loadIndex("/app?q=zzz");

    expect(result).toMatchObject({
      rows: [],
      total: 0,
      storeIsEmpty: false,
    });
  });

  it("reports an empty shop even when another shop has certificates", async () => {
    await createCertificateRow({}, { shop: OTHER_SHOP });

    const result = await loadIndex("/app");

    expect(result).toMatchObject({
      rows: [],
      total: 0,
      page: 1,
      storeIsEmpty: true,
    });
  });
});

describe("GET /app/certificates", () => {
  it.each([
    ["/app/certificates?view=grid", "/app?view=grid"],
    ["/app/certificates", "/app"],
    [
      "/app/certificates?embedded=1&host=YWRtaW4&q=henry",
      "/app?embedded=1&host=YWRtaW4&q=henry",
    ],
  ])("redirects %s to %s", async (path, location) => {
    const response = await certificatesLoader(loaderArguments(path));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(location);
    expect(completePendingInBackground).not.toHaveBeenCalled();
  });
});
