import { describe, expect, it, vi } from "vitest";
import {
  createFakeJudge,
  PII_MARKERS,
  rawJudgeReview,
  rawJudgeReviews,
  type JudgeFailure,
} from "./judge-api.fake";

const SHOP_DOMAIN = "test-shop.myshopify.com";
const API_TOKEN = "test-token";

function reviewsUrl(overrides: Record<string, string | number> = {}): string {
  const query = new URLSearchParams(
    Object.entries({
      shop_domain: SHOP_DOMAIN,
      api_token: API_TOKEN,
      per_page: 100,
      page: 1,
      ...overrides,
    }).map(([key, value]) => [key, String(value)]),
  );

  return `https://api.judge.me/api/v1/reviews?${query}`;
}

type JudgePage = {
  current_page: number;
  per_page: number;
  reviews: { id: number }[];
};

async function readPage(response: Response): Promise<JudgePage> {
  return (await response.json()) as JudgePage;
}

describe("fake Judge.me API: pagination", () => {
  it("splits 123 reviews into pages of 100 and 23 and records both requests", async () => {
    const fake = createFakeJudge({ reviews: rawJudgeReviews(123) });

    const first = await readPage(await fake.fetch(reviewsUrl({ page: 1 })));
    const second = await readPage(await fake.fetch(reviewsUrl({ page: 2 })));

    expect(first).toMatchObject({ current_page: 1, per_page: 100 });
    expect(first.reviews).toHaveLength(100);
    expect(second).toMatchObject({ current_page: 2, per_page: 100 });
    expect(second.reviews).toHaveLength(23);
    expect(
      new Set([...first.reviews, ...second.reviews].map(({ id }) => id)),
    ).toHaveProperty("size", 123);
    expect(fake.requests.map(({ page, perPage }) => [page, perPage])).toEqual([
      [1, 100],
      [2, 100],
    ]);
  });

  it("clamps per_page above 100 to 100", async () => {
    const fake = createFakeJudge({ reviews: rawJudgeReviews(123) });

    const body = await readPage(
      await fake.fetch(reviewsUrl({ per_page: 1000 })),
    );

    expect(body.per_page).toBe(100);
    expect(body.reviews).toHaveLength(100);
  });

  it("returns one review for per_page 0", async () => {
    const fake = createFakeJudge({ reviews: rawJudgeReviews(123) });

    const body = await readPage(await fake.fetch(reviewsUrl({ per_page: 0 })));

    expect(body.reviews).toHaveLength(1);
  });

  it("returns an empty page past the end", async () => {
    const fake = createFakeJudge({ reviews: rawJudgeReviews(123) });

    const body = await readPage(await fake.fetch(reviewsUrl({ page: 3 })));

    expect(body).toEqual({ current_page: 3, per_page: 100, reviews: [] });
  });

  it("serves the reviews it was given through setReviews", async () => {
    const fake = createFakeJudge();

    expect((await readPage(await fake.fetch(reviewsUrl()))).reviews).toEqual(
      [],
    );

    fake.setReviews(rawJudgeReviews(2));

    expect(
      (await readPage(await fake.fetch(reviewsUrl()))).reviews,
    ).toHaveLength(2);
  });
});

describe("fake Judge.me API: requests", () => {
  it("records the credentials, the paging, the Accept header and whether a signal was sent", async () => {
    const fake = createFakeJudge();

    await fake.fetch(reviewsUrl({ page: 4, per_page: 25 }), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    await fake.fetch(reviewsUrl());

    expect(fake.requests).toEqual([
      {
        shopDomain: SHOP_DOMAIN,
        apiToken: API_TOKEN,
        page: 4,
        perPage: 25,
        accept: "application/json",
        hasSignal: true,
      },
      {
        shopDomain: SHOP_DOMAIN,
        apiToken: API_TOKEN,
        page: 1,
        perPage: 100,
        accept: null,
        hasSignal: false,
      },
    ]);
  });

  it("accepts a URL object and a Request", async () => {
    const fake = createFakeJudge();

    await fake.fetch(new URL(reviewsUrl({ page: 2 })));
    await fake.fetch(new Request(reviewsUrl({ page: 3 })));

    expect(fake.requests.map(({ page }) => page)).toEqual([2, 3]);
  });

  it("throws for a request addressed to another host", async () => {
    const fake = createFakeJudge();

    await expect(
      fake.fetch("https://example.com/api/v1/reviews?page=1"),
    ).rejects.toThrow(/api\.judge\.me/);
    await expect(
      fake.fetch("https://api.judge.me.example.com/api/v1/reviews"),
    ).rejects.toThrow(/api\.judge\.me/);
    expect(fake.requests).toEqual([]);
  });
});

describe("fake Judge.me API: failures", () => {
  it.each([401, 403, 404, 429, 500, 503] as const)(
    "answers status %i",
    async (status) => {
      const fake = createFakeJudge({
        reviews: rawJudgeReviews(3),
        failure: { status },
      });

      const response = await fake.fetch(reviewsUrl());

      expect(response.status).toBe(status);
      expect(await response.json()).toEqual(
        status === 401
          ? {
              error:
                "Failed to authenticate. Shop domain or Api Token is wrong",
            }
          : {},
      );
      expect(fake.requests).toHaveLength(1);
    },
  );

  it("answers text that isn't JSON", async () => {
    const fake = createFakeJudge({ failure: { nonJson: true } });

    const response = await fake.fetch(reviewsUrl());
    const text = await response.text();

    expect(text.length).toBeGreaterThan(0);
    expect(() => JSON.parse(text)).toThrow();
  });

  it("rejects with a TypeError for a network failure", async () => {
    const fake = createFakeJudge({ failure: { network: true } });

    await expect(fake.fetch(reviewsUrl())).rejects.toBeInstanceOf(TypeError);
    expect(fake.requests).toHaveLength(1);
  });

  it("hangs until the signal aborts, then rejects with its reason", async () => {
    const fake = createFakeJudge({ failure: { hang: true } });
    const abortedBefore = AbortSignal.abort();
    const controller = new AbortController();
    const reason = new Error("timed out");

    await expect(
      fake.fetch(reviewsUrl(), { signal: abortedBefore }),
    ).rejects.toBe(abortedBefore.reason);

    const pending = fake.fetch(reviewsUrl(), { signal: controller.signal });
    const settled = vi.fn();

    pending.catch(settled);
    await Promise.resolve();

    expect(settled).not.toHaveBeenCalled();

    controller.abort(reason);

    await expect(pending).rejects.toBe(reason);
  });

  it("refuses to hang without a signal", async () => {
    const fake = createFakeJudge({ failure: { hang: true } });

    await expect(fake.fetch(reviewsUrl())).rejects.toThrow(/signal/);
  });

  it("returns page 1 whatever page is asked for", async () => {
    const reviews = rawJudgeReviews(250);
    const fake = createFakeJudge({ reviews, failure: { ignorePage: true } });

    const second = await readPage(await fake.fetch(reviewsUrl({ page: 2 })));
    const third = await readPage(await fake.fetch(reviewsUrl({ page: 3 })));

    expect(second.current_page).toBe(1);
    expect(second.reviews.map(({ id }) => id)).toEqual(
      reviews.slice(0, 100).map(({ id }) => id),
    );
    expect(third.reviews.map(({ id }) => id)).toEqual(
      second.reviews.map(({ id }) => id),
    );
    expect(fake.requests.map(({ page }) => page)).toEqual([2, 3]);
  });

  it("applies and clears a failure through setFailure", async () => {
    const fake = createFakeJudge({ reviews: rawJudgeReviews(1) });
    const failure: JudgeFailure = { status: 500 };

    fake.setFailure(failure);

    expect((await fake.fetch(reviewsUrl())).status).toBe(500);

    fake.setFailure(null);

    const response = await fake.fetch(reviewsUrl());

    expect(response.status).toBe(200);
    expect((await readPage(response)).reviews).toHaveLength(1);
  });
});

describe("raw Judge.me reviews", () => {
  it("carries every PII marker once serialised", () => {
    const serialised = JSON.stringify(rawJudgeReview());

    expect(PII_MARKERS).toEqual([
      "pii-email@example.test",
      "PIIMARKER",
      "192.0.2.250",
      "777000777",
    ]);

    for (const marker of PII_MARKERS) {
      expect(serialised).toContain(marker);
    }
  });

  it("is a visible review by Alex Example with every field of Judge's shape", () => {
    expect(rawJudgeReview()).toMatchObject({
      published: true,
      hidden: false,
      curated: "ok",
      reviewer: { name: "Alex Example" },
    });
    expect(Object.keys(rawJudgeReview()).sort()).toEqual(
      [
        "id",
        "title",
        "body",
        "rating",
        "product_external_id",
        "reviewer",
        "source",
        "curated",
        "published",
        "hidden",
        "verified",
        "featured",
        "pinned",
        "created_at",
        "updated_at",
        "has_published_pictures",
        "has_published_videos",
        "pictures",
        "ip_address",
        "product_title",
        "product_handle",
      ].sort(),
    );
    expect(Object.keys(rawJudgeReview().reviewer).sort()).toEqual(
      [
        "id",
        "external_id",
        "email",
        "name",
        "phone",
        "accepts_marketing",
        "unsubscribed_at",
        "tags",
      ].sort(),
    );
  });

  it("applies overrides", () => {
    expect(rawJudgeReview({ rating: 2, body: "" })).toMatchObject({
      rating: 2,
      body: "",
    });
  });

  it("builds reviews with unique ids and created_at newest first, one hour apart", () => {
    const reviews = rawJudgeReviews(3);
    const timestamps = reviews.map((review) => review.created_at);

    expect(new Set(reviews.map(({ id }) => id)).size).toBe(3);
    expect(timestamps).toEqual([
      "2026-10-29T18:52:50+00:00",
      "2026-10-29T17:52:50+00:00",
      "2026-10-29T16:52:50+00:00",
    ]);
    expect(timestamps).toEqual([...timestamps].sort().reverse());
  });

  it("applies per-index overrides", () => {
    const reviews = rawJudgeReviews(3, (index) => ({ rating: index + 1 }));

    expect(reviews.map(({ rating }) => rating)).toEqual([1, 2, 3]);
  });
});
