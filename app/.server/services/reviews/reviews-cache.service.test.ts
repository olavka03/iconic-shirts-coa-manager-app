import { afterEach, describe, expect, it, vi } from "vitest";
import { JudgeReviewsError } from "~/.server/gateways/judge-reviews.gateway";
import { setLogSink, type LogLine } from "~/.server/logging/logger.service";
import type { JudgeReview } from "~/features/reviews/types/judge-review.types";
import { deferred } from "../../../../tests/helpers/fetch-stub.utils";
import {
  createReviewsCache,
  type LoadedReviews,
} from "./reviews-cache.service";

const SHOP = "shop-a.myshopify.com";
const TTL_MS = 300000;
const MAX_STALE_MS = 21600000;
const FAILURE_RETRY_MS = 30000;
const START_MS = 1_000_000;
const LOG_KEYS = [
  "level",
  "event",
  "time",
  "shop",
  "kind",
  "status",
  "servedStale",
];

afterEach(() => {
  setLogSink(null);
});

function buildReview(id: number): JudgeReview {
  return {
    id,
    rating: 5,
    title: null,
    body: "Arrived quickly and exactly as described.",
    createdAtMs: Date.UTC(2026, 9, 1),
    reviewerName: "Alex Example",
    source: "shop-app",
    verified: "verified-purchase",
    productExternalId: 1234567890123,
    productHandle: "example-shirt",
    productTitle: "Example Shirt",
    published: true,
    hidden: false,
    curated: "ok",
  };
}

function buildLoaded(...ids: number[]): LoadedReviews {
  return { reviews: ids.map(buildReview), truncated: false };
}

function setUp(overrides: { maxKeys?: number } = {}) {
  const clock = { nowMs: START_MS };
  const load = vi.fn<(key: string) => Promise<LoadedReviews>>();
  const lines: LogLine[] = [];

  setLogSink((line) => lines.push(line));

  const cache = createReviewsCache({
    load,
    now: () => clock.nowMs,
    ttlMs: TTL_MS,
    maxStaleMs: MAX_STALE_MS,
    failureRetryMs: FAILURE_RETRY_MS,
    maxKeys: overrides.maxKeys ?? 10,
  });

  return { cache, clock, load, lines };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("The promise was expected to reject.");
    },
    (error: unknown) => error,
  );
}

describe("createReviewsCache", () => {
  it("serves a second get inside the TTL without loading", async () => {
    const { cache, clock, load } = setUp();
    load.mockResolvedValue(buildLoaded(1, 2));

    const first = await cache.get(SHOP);
    clock.nowMs += TTL_MS - 1;
    const second = await cache.get(SHOP);

    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(SHOP);
    expect(second).toBe(first);
    expect(first).toEqual({
      reviews: [buildReview(1), buildReview(2)],
      truncated: false,
      loadedAtMs: START_MS,
    });
  });

  it("keeps the truncated flag of the load", async () => {
    const { cache, load } = setUp();
    load.mockResolvedValue({ reviews: [buildReview(1)], truncated: true });

    const entry = await cache.get(SHOP);

    expect(entry.truncated).toBe(true);
  });

  it("treats an empty list as a valid entry", async () => {
    const { cache, load } = setUp();
    load.mockResolvedValue({ reviews: [], truncated: false });

    await cache.get(SHOP);
    const entry = await cache.get(SHOP);

    expect(entry.reviews).toEqual([]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("returns an entry as old as the TTL at once and refreshes in the background", async () => {
    const { cache, clock, load } = setUp();
    const refresh = deferred<LoadedReviews>();
    load.mockResolvedValueOnce(buildLoaded(1));
    load.mockReturnValueOnce(refresh.promise);

    await cache.get(SHOP);
    clock.nowMs += TTL_MS;
    const stale = await cache.get(SHOP);

    expect(stale.reviews.map((review) => review.id)).toEqual([1]);
    expect(load).toHaveBeenCalledTimes(2);

    const stillStale = await cache.get(SHOP);

    expect(stillStale).toBe(stale);
    expect(load).toHaveBeenCalledTimes(2);

    refresh.resolve(buildLoaded(2, 3));
    await settle();
    const fresh = await cache.get(SHOP);

    expect(fresh.reviews.map((review) => review.id)).toEqual([2, 3]);
    expect(fresh.loadedAtMs).toBe(START_MS + TTL_MS);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shares one load between concurrent cold gets", async () => {
    const { cache, load } = setUp();
    const pending = deferred<LoadedReviews>();
    load.mockReturnValue(pending.promise);

    const calls = Array.from(Array(5).keys(), () => cache.get(SHOP));

    expect(load).toHaveBeenCalledTimes(1);

    pending.resolve(buildLoaded(1));
    const entries = await Promise.all(calls);

    expect(entries.every((entry) => entry === entries[0])).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("starts no extra load for gets during a refresh", async () => {
    const { cache, clock, load } = setUp();
    const refresh = deferred<LoadedReviews>();
    load.mockResolvedValueOnce(buildLoaded(1));
    load.mockReturnValueOnce(refresh.promise);

    await cache.get(SHOP);
    clock.nowMs += TTL_MS;
    await Promise.all([cache.get(SHOP), cache.get(SHOP), cache.get(SHOP)]);

    expect(load).toHaveBeenCalledTimes(2);

    refresh.resolve(buildLoaded(2));
    await settle();
  });

  it("serves the stale entry when a refresh fails, logs once and backs off", async () => {
    const { cache, clock, load, lines } = setUp();
    load.mockResolvedValueOnce(buildLoaded(1));
    load.mockRejectedValueOnce(new JudgeReviewsError("upstream", 500));

    await cache.get(SHOP);
    clock.nowMs += TTL_MS;
    const stale = await cache.get(SHOP);
    await settle();

    expect(stale.reviews.map((review) => review.id)).toEqual([1]);
    expect(lines).toEqual([
      {
        level: "warn",
        event: "reviews.load_failed",
        time: expect.any(String),
        shop: SHOP,
        kind: "JudgeReviewsError:upstream",
        status: 500,
        servedStale: true,
      },
    ]);

    clock.nowMs += FAILURE_RETRY_MS - 1;
    const stillStale = await cache.get(SHOP);

    expect(stillStale).toBe(stale);
    expect(load).toHaveBeenCalledTimes(2);

    clock.nowMs += 1;
    load.mockResolvedValueOnce(buildLoaded(2));
    await cache.get(SHOP);
    await settle();
    const fresh = await cache.get(SHOP);

    expect(load).toHaveBeenCalledTimes(3);
    expect(fresh.reviews.map((review) => review.id)).toEqual([2]);
    expect(lines).toHaveLength(1);
  });

  it("rejects a failed cold load, logs an error and rejects again during the backoff", async () => {
    const { cache, clock, load, lines } = setUp();
    const failure = new JudgeReviewsError("upstream", 500);
    load.mockRejectedValueOnce(failure);

    const first = await rejectionOf(cache.get(SHOP));

    expect(first).toBe(failure);
    expect(lines).toEqual([
      {
        level: "error",
        event: "reviews.load_failed",
        time: expect.any(String),
        shop: SHOP,
        kind: "JudgeReviewsError:upstream",
        status: 500,
        servedStale: false,
      },
    ]);

    clock.nowMs += FAILURE_RETRY_MS - 1;
    const second = await rejectionOf(cache.get(SHOP));

    expect(second).toBe(failure);
    expect(load).toHaveBeenCalledTimes(1);
    expect(lines).toHaveLength(1);

    clock.nowMs += 1;
    load.mockResolvedValueOnce(buildLoaded(1));
    const entry = await cache.get(SHOP);

    expect(load).toHaveBeenCalledTimes(2);
    expect(entry.reviews).toHaveLength(1);

    clock.nowMs += TTL_MS;
    load.mockResolvedValueOnce(buildLoaded(2));
    await cache.get(SHOP);

    expect(load).toHaveBeenCalledTimes(3);
  });

  it("logs a failure without a status for an error that has none", async () => {
    const { cache, load, lines } = setUp();
    load.mockRejectedValueOnce(new JudgeReviewsError("not_configured"));

    await rejectionOf(cache.get(SHOP));

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: "error",
      kind: "JudgeReviewsError:not_configured",
      servedStale: false,
    });
    expect(lines[0].status).toBeUndefined();
  });

  it("does not serve an entry older than the max stale age", async () => {
    const { cache, clock, load } = setUp();
    const failure = new JudgeReviewsError("timeout");
    load.mockResolvedValueOnce(buildLoaded(1));
    load.mockResolvedValueOnce(buildLoaded(2));

    await cache.get(SHOP);
    clock.nowMs += MAX_STALE_MS + 1;
    const replaced = await cache.get(SHOP);

    expect(replaced.reviews.map((review) => review.id)).toEqual([2]);
    expect(load).toHaveBeenCalledTimes(2);

    clock.nowMs += MAX_STALE_MS + 1;
    load.mockRejectedValueOnce(failure);

    expect(await rejectionOf(cache.get(SHOP))).toBe(failure);
  });

  it("serves an entry exactly as old as the max stale age", async () => {
    const { cache, clock, load } = setUp();
    load.mockResolvedValueOnce(buildLoaded(1));
    load.mockReturnValueOnce(new Promise(() => undefined));

    await cache.get(SHOP);
    clock.nowMs += MAX_STALE_MS;
    const entry = await cache.get(SHOP);

    expect(entry.reviews.map((review) => review.id)).toEqual([1]);
  });

  it("isolates keys from each other", async () => {
    const { cache, load } = setUp();
    load.mockImplementation(async (key) =>
      key === "a" ? buildLoaded(1) : buildLoaded(2),
    );

    const first = await cache.get("a");
    const second = await cache.get("b");
    await cache.get("a");
    await cache.get("b");

    expect(first.reviews[0].id).toBe(1);
    expect(second.reviews[0].id).toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("evicts the oldest key when it holds more than maxKeys", async () => {
    const { cache, load } = setUp({ maxKeys: 2 });
    load.mockImplementation(async () => buildLoaded(1));

    await cache.get("a");
    await cache.get("b");
    await cache.get("c");

    expect(load).toHaveBeenCalledTimes(3);

    await cache.get("c");

    expect(load).toHaveBeenCalledTimes(3);

    await cache.get("a");

    expect(load).toHaveBeenCalledTimes(4);
  });

  it("clear drops entries and the backoff", async () => {
    const { cache, load } = setUp();
    load.mockRejectedValueOnce(new JudgeReviewsError("upstream", 500));

    await rejectionOf(cache.get(SHOP));
    cache.clear();
    load.mockResolvedValueOnce(buildLoaded(1));
    await cache.get(SHOP);

    expect(load).toHaveBeenCalledTimes(2);

    cache.clear();
    load.mockResolvedValueOnce(buildLoaded(2));
    const entry = await cache.get(SHOP);

    expect(load).toHaveBeenCalledTimes(3);
    expect(entry.reviews[0].id).toBe(2);
  });

  it("keeps loading when nobody awaits the first get", async () => {
    const { cache, load } = setUp();
    const pending = deferred<LoadedReviews>();
    load.mockReturnValue(pending.promise);

    void cache.get(SHOP);
    pending.resolve(buildLoaded(1));
    await settle();
    const entry = await cache.get(SHOP);

    expect(entry.reviews.map((review) => review.id)).toEqual([1]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("writes log lines that carry only the allowed keys", async () => {
    const { cache, clock, load, lines } = setUp();
    load.mockResolvedValueOnce(buildLoaded(1));
    load.mockRejectedValueOnce(new JudgeReviewsError("upstream", 503));
    load.mockRejectedValueOnce(new JudgeReviewsError("timeout"));

    await cache.get(SHOP);
    clock.nowMs += TTL_MS;
    await cache.get(SHOP);
    await settle();
    clock.nowMs += MAX_STALE_MS;
    await rejectionOf(cache.get(SHOP));

    expect(lines).toHaveLength(2);

    for (const line of lines) {
      expect(Object.keys(line).every((key) => LOG_KEYS.includes(key))).toBe(
        true,
      );
    }
  });
});
