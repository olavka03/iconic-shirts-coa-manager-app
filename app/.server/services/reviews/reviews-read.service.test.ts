import { afterEach, describe, expect, it, vi } from "vitest";
import { JudgeReviewsError } from "~/.server/gateways/judge-reviews.gateway";
import { setLogSink, type LogLine } from "~/.server/logging/logger.service";
import {
  createFakeJudge,
  PII_MARKERS,
  rawJudgeReview,
  rawJudgeReviews,
  type FakeJudge,
} from "../../../../tests/fakes/judge-api.fake";
import { getVisibleReviews, reviewsCache } from "./reviews-read.service";

const TOKEN = "judge-token-SECRET-123";
const SHOP = "shop-a.myshopify.com";
const OTHER_SHOP = "shop-b.myshopify.com";
const OVERRIDE_DOMAIN = "override-shop.myshopify.com";
const LEAK_BODY = "LeakCheckBody sentence that must stay out of logs.";
const LEAK_NAME = "LeakCheckName Reviewer";

afterEach(() => {
  reviewsCache.clear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  setLogSink(null);
});

function arrange(
  options: {
    token?: string | null;
    domain?: string | null;
    reviews?: unknown[];
  } = {},
): { fake: FakeJudge; lines: LogLine[] } {
  const { token = TOKEN, domain = null, reviews = [] } = options;
  const fake = createFakeJudge({ reviews });
  const lines: LogLine[] = [];

  vi.stubGlobal("fetch", fake.fetch);
  vi.stubEnv("JUDGE_API_TOKEN", token ?? undefined);
  vi.stubEnv("JUDGE_SHOP_DOMAIN", domain ?? undefined);
  setLogSink((line) => lines.push(line));

  return { fake, lines };
}

function linesOf(lines: LogLine[], event: string): LogLine[] {
  return lines.filter((line) => line.event === event);
}

function idsOf(reviews: { id: number }[]): number[] {
  return reviews.map((review) => review.id);
}

async function importFreshService() {
  vi.resetModules();

  const logger = await import("~/.server/logging/logger.service");
  const service = await import("./reviews-read.service");

  return {
    getVisibleReviews: service.getVisibleReviews,
    setFreshLogSink: logger.setLogSink,
  };
}

describe("getVisibleReviews", () => {
  it("asks Judge for the lower-cased proxy shop and keeps only visible reviews", async () => {
    const { fake, lines } = arrange({
      reviews: [
        rawJudgeReview({ id: 1 }),
        rawJudgeReview({ id: 2, hidden: true }),
        rawJudgeReview({ id: 3, published: false }),
        rawJudgeReview({ id: 4, curated: "spam" }),
        rawJudgeReview({ id: 5 }),
      ],
    });

    const reviews = await getVisibleReviews("Shop-A.myshopify.com");

    expect(idsOf(reviews)).toEqual([1, 5]);
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]).toMatchObject({
      shopDomain: SHOP,
      apiToken: TOKEN,
    });
    expect(linesOf(lines, "reviews.shop_override_active")).toEqual([]);
  });

  it("serves a second call inside the TTL without asking Judge again", async () => {
    const { fake } = arrange({ reviews: rawJudgeReviews(3) });

    const first = await getVisibleReviews(SHOP);
    const second = await getVisibleReviews(SHOP);

    expect(second).toBe(first);
    expect(fake.requests).toHaveLength(1);
  });

  it("uses the override domain over the proxy shop and as the cache key", async () => {
    const { fake } = arrange({
      domain: `  ${OVERRIDE_DOMAIN}  `,
      reviews: rawJudgeReviews(3),
    });

    const first = await getVisibleReviews(SHOP);
    const second = await getVisibleReviews(OTHER_SHOP);

    expect(second).toBe(first);
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0].shopDomain).toBe(OVERRIDE_DOMAIN);
  });

  it("ignores a blank override", async () => {
    const { fake } = arrange({ domain: "   ", reviews: rawJudgeReviews(2) });

    await getVisibleReviews("Shop-A.myshopify.com");

    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0].shopDomain).toBe(SHOP);
  });

  it("reads the environment at call time", async () => {
    const fresh = await importFreshService();
    const { fake } = arrange({ reviews: rawJudgeReviews(2) });

    const reviews = await fresh.getVisibleReviews(SHOP);

    expect(reviews).toHaveLength(2);
    expect(fake.requests[0]).toMatchObject({
      shopDomain: SHOP,
      apiToken: TOKEN,
    });
  });

  it.each([
    ["missing", null],
    ["blank", "   "],
  ])(
    "rejects with not_configured and no request when the token is %s",
    async (_name, token) => {
      const { fake, lines } = arrange({ token, reviews: rawJudgeReviews(2) });

      await expect(getVisibleReviews(SHOP)).rejects.toBeInstanceOf(
        JudgeReviewsError,
      );
      await expect(getVisibleReviews(SHOP)).rejects.toMatchObject({
        kind: "not_configured",
      });

      expect(fake.requests).toEqual([]);
      expect(linesOf(lines, "reviews.load_failed")).toHaveLength(1);
      expect(linesOf(lines, "reviews.load_failed")[0]).toMatchObject({
        level: "error",
        shop: SHOP,
        kind: "JudgeReviewsError:not_configured",
        servedStale: false,
      });
    },
  );

  it("rejects with not_configured and no request when there is no shop domain", async () => {
    const { fake, lines } = arrange({ reviews: rawJudgeReviews(2) });

    await expect(getVisibleReviews("")).rejects.toMatchObject({
      kind: "not_configured",
    });

    expect(fake.requests).toEqual([]);
    expect(lines).toEqual([]);
  });

  it("logs what was loaded", async () => {
    const { lines } = arrange({ reviews: rawJudgeReviews(123) });

    const reviews = await getVisibleReviews(SHOP);

    expect(reviews).toHaveLength(123);
    expect(linesOf(lines, "reviews.loaded")).toEqual([
      {
        level: "info",
        event: "reviews.loaded",
        time: expect.any(String),
        shop: SHOP,
        count: 123,
        pages: 2,
        elapsedMs: expect.any(Number),
      },
    ]);
    expect(linesOf(lines, "reviews.page_cap_reached")).toEqual([]);
    expect(linesOf(lines, "reviews.malformed_skipped")).toEqual([]);
  });

  it("counts only the visible reviews in the loaded line", async () => {
    const { lines } = arrange({
      reviews: rawJudgeReviews(10, (index) => ({ hidden: index < 4 })),
    });

    const reviews = await getVisibleReviews(SHOP);

    expect(reviews).toHaveLength(6);
    expect(linesOf(lines, "reviews.loaded")[0]).toMatchObject({ count: 6 });
  });

  it("warns when the page cap cut the list", async () => {
    const { lines } = arrange({ reviews: rawJudgeReviews(5200) });

    const reviews = await getVisibleReviews(SHOP);

    expect(reviews).toHaveLength(5000);
    expect(linesOf(lines, "reviews.page_cap_reached")).toEqual([
      {
        level: "warn",
        event: "reviews.page_cap_reached",
        time: expect.any(String),
        shop: SHOP,
        pages: 50,
      },
    ]);
    expect(linesOf(lines, "reviews.loaded")[0]).toMatchObject({ pages: 50 });
  });

  it("warns about malformed rows and serves the other rows", async () => {
    const { lines } = arrange({
      reviews: rawJudgeReviews(10, (index) => (index < 2 ? { rating: 9 } : {})),
    });

    const reviews = await getVisibleReviews(SHOP);

    expect(reviews).toHaveLength(8);
    expect(linesOf(lines, "reviews.malformed_skipped")).toEqual([
      {
        level: "warn",
        event: "reviews.malformed_skipped",
        time: expect.any(String),
        shop: SHOP,
        count: 2,
      },
    ]);
  });

  it("logs the shop override once per process", async () => {
    const fresh = await importFreshService();
    const { lines } = arrange({
      domain: OVERRIDE_DOMAIN,
      reviews: rawJudgeReviews(2),
    });

    fresh.setFreshLogSink((line) => lines.push(line));

    await fresh.getVisibleReviews(SHOP);
    await fresh.getVisibleReviews(OTHER_SHOP);
    fresh.setFreshLogSink(null);

    expect(linesOf(lines, "reviews.shop_override_active")).toEqual([
      {
        level: "warn",
        event: "reviews.shop_override_active",
        time: expect.any(String),
        shop: OVERRIDE_DOMAIN,
      },
    ]);
  });

  it("keeps the token, the Judge address and reviewer data out of the logs", async () => {
    const reviewer = { ...rawJudgeReview().reviewer, name: LEAK_NAME };
    const { fake, lines } = arrange({
      reviews: rawJudgeReviews(12, (index) =>
        index < 2 ? { rating: 9 } : { body: LEAK_BODY, reviewer },
      ),
    });

    await getVisibleReviews(SHOP);
    fake.setFailure({ status: 500 });
    await expect(getVisibleReviews(OTHER_SHOP)).rejects.toBeInstanceOf(
      JudgeReviewsError,
    );

    const events = lines.map((line) => line.event);

    expect(events).toContain("reviews.loaded");
    expect(events).toContain("reviews.malformed_skipped");
    expect(events).toContain("reviews.load_failed");

    const written = JSON.stringify(lines);

    expect(written).not.toContain(TOKEN);
    expect(written).not.toContain("api.judge.me");
    expect(written).not.toContain(LEAK_BODY);
    expect(written).not.toContain(LEAK_NAME);

    for (const marker of PII_MARKERS) {
      expect(written).not.toContain(marker);
    }
  });
});
