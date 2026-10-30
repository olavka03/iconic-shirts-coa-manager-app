import { describe, expect, it } from "vitest";
import type { JudgeReview } from "~/features/reviews/types/judge-review.types";
import type { ReviewsQuery } from "~/features/reviews/types/reviews-api.types";
import { isPubliclyVisible, selectReviews } from "./reviews-select.utils";

const SHOP_LEVEL_HANDLE = "judgeme-shop-reviews";

function buildReview(overrides: Partial<JudgeReview> = {}): JudgeReview {
  return {
    id: 1,
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
    ...overrides,
  };
}

function buildQuery(overrides: Partial<ReviewsQuery> = {}): ReviewsQuery {
  return {
    limit: 50,
    page: 1,
    sort: "date",
    order: "desc",
    productId: null,
    productHandle: null,
    rating: null,
    minRating: null,
    hasText: false,
    ...overrides,
  };
}

function idsOf(reviews: JudgeReview[]): number[] {
  return reviews.map((review) => review.id);
}

function select(reviews: JudgeReview[], overrides: Partial<ReviewsQuery> = {}) {
  return selectReviews(reviews, buildQuery(overrides));
}

describe("isPubliclyVisible", () => {
  it("is true for a published, visible, curated ok review", () => {
    expect(isPubliclyVisible(buildReview())).toBe(true);
  });

  it.each([
    ["unpublished", { published: false }],
    ["hidden", { hidden: true }],
    ["spam", { curated: "spam" }],
    ["pending", { curated: "not-yet" }],
    ["differently cased", { curated: "OK" }],
  ])("is false for a %s review", (_label, overrides) => {
    expect(isPubliclyVisible(buildReview(overrides))).toBe(false);
  });
});

describe("selectReviews filters", () => {
  const SHIRT = buildReview({ id: 1 });
  const OTHER = buildReview({
    id: 2,
    productExternalId: 42,
    productHandle: "other-shirt",
  });
  const SHOP_LEVEL = buildReview({
    id: 3,
    productExternalId: 0,
    productHandle: SHOP_LEVEL_HANDLE,
  });
  const ALL = [SHIRT, OTHER, SHOP_LEVEL];

  it("keeps everything for the default query", () => {
    const result = select(ALL);

    expect(result.total).toBe(3);
    expect(idsOf(result.items)).toStrictEqual([3, 2, 1]);
  });

  it("filters by product id", () => {
    const result = select(ALL, { productId: 42 });

    expect(idsOf(result.items)).toStrictEqual([2]);
    expect(result.total).toBe(1);
  });

  it("filters by product handle, ignoring case", () => {
    const result = select(ALL, { productHandle: "example-shirt" });

    expect(idsOf(result.items)).toStrictEqual([1]);
  });

  it("matches a handle stored with capitals", () => {
    const capitalised = buildReview({
      id: 4,
      productHandle: "Example-Shirt",
    });

    expect(
      idsOf(select([capitalised], { productHandle: "example-shirt" }).items),
    ).toStrictEqual([4]);
  });

  it("never matches a shop-level review to a product filter", () => {
    expect(select(ALL, { productHandle: SHOP_LEVEL_HANDLE })).toStrictEqual({
      items: [],
      total: 0,
    });
    expect(select(ALL, { productId: 0 })).toStrictEqual({
      items: [],
      total: 0,
    });
  });

  it("filters by exact rating", () => {
    const reviews = [1, 2, 3, 4, 5].map((rating) =>
      buildReview({ id: rating, rating }),
    );

    expect(idsOf(select(reviews, { rating: 3 }).items)).toStrictEqual([3]);
  });

  it("filters by minimum rating", () => {
    const reviews = [1, 2, 3, 4, 5].map((rating) =>
      buildReview({ id: rating, rating }),
    );

    expect(idsOf(select(reviews, { minRating: 4 }).items)).toStrictEqual([
      5, 4,
    ]);
  });

  it("applies rating and minimum rating together", () => {
    const reviews = [
      buildReview({ id: 1, rating: 5 }),
      buildReview({ id: 2, rating: 4 }),
      buildReview({ id: 3, rating: 5 }),
    ];

    expect(
      idsOf(select(reviews, { rating: 5, minRating: 4 }).items),
    ).toStrictEqual([3, 1]);
    expect(select(reviews, { rating: 4, minRating: 5 })).toStrictEqual({
      items: [],
      total: 0,
    });
  });

  it("combines the product filter with the rating filters", () => {
    const reviews = [
      buildReview({ id: 1, rating: 5 }),
      buildReview({ id: 2, rating: 2 }),
      buildReview({ id: 3, rating: 5, productExternalId: 42 }),
    ];

    expect(
      idsOf(select(reviews, { productId: 1234567890123, minRating: 4 }).items),
    ).toStrictEqual([1]);
  });

  it.each(["", "   ", "\n "])("has_text drops the body %j", (body) => {
    expect(select([buildReview({ body })], { hasText: true })).toStrictEqual({
      items: [],
      total: 0,
    });
  });

  it.each([
    "Mooi shirt, snel geleverd en goed verpakt.",
    "Love it 😀",
    "a\r\nb",
    "  padded  ",
  ])("has_text keeps the body %j", (body) => {
    expect(
      idsOf(select([buildReview({ body })], { hasText: true }).items),
    ).toStrictEqual([1]);
  });

  it("keeps empty bodies when has_text is off", () => {
    expect(select([buildReview({ body: "" })]).total).toBe(1);
  });

  it("does not modify the input array", () => {
    const reviews = [
      buildReview({ id: 1, createdAtMs: 100 }),
      buildReview({ id: 2, createdAtMs: 300 }),
      buildReview({ id: 3, createdAtMs: 200 }),
    ];

    select(reviews);

    expect(idsOf(reviews)).toStrictEqual([1, 2, 3]);
  });
});

describe("selectReviews sorting", () => {
  const FIXTURE = [
    buildReview({ id: 3, rating: 5, createdAtMs: 200 }),
    buildReview({ id: 6, rating: 4, createdAtMs: 200 }),
    buildReview({ id: 1, rating: 5, createdAtMs: 100 }),
    buildReview({ id: 4, rating: 3, createdAtMs: 300 }),
    buildReview({ id: 7, rating: 4, createdAtMs: 200 }),
    buildReview({ id: 2, rating: 5, createdAtMs: 200 }),
    buildReview({ id: 5, rating: 3, createdAtMs: 100 }),
  ];

  it.each([
    ["date", "desc", [4, 7, 6, 3, 2, 5, 1]],
    ["date", "asc", [5, 1, 7, 6, 3, 2, 4]],
    ["rating", "desc", [3, 2, 1, 7, 6, 4, 5]],
    ["rating", "asc", [4, 5, 7, 6, 3, 2, 1]],
  ] as const)(
    "sort=%s order=%s ties fall back to newest first then higher id",
    (sort, order, expected) => {
      expect(idsOf(select(FIXTURE, { sort, order }).items)).toStrictEqual(
        expected,
      );
    },
  );

  it("compares created times and ids as numbers, not text", () => {
    const reviews = [
      buildReview({ id: 9, createdAtMs: 9 }),
      buildReview({ id: 10, createdAtMs: 10 }),
      buildReview({ id: 100, createdAtMs: 9 }),
    ];

    expect(idsOf(select(reviews).items)).toStrictEqual([10, 100, 9]);
    expect(idsOf(select(reviews, { order: "asc" }).items)).toStrictEqual([
      100, 9, 10,
    ]);
  });
});

describe("selectReviews paging", () => {
  const FIVE = [1, 2, 3, 4, 5].map((id) =>
    buildReview({ id, createdAtMs: id * 1000 }),
  );

  it("slices pages of the limit and reports the filtered total", () => {
    const pages = [1, 2, 3].map((page) => select(FIVE, { limit: 2, page }));

    expect(pages.map((result) => idsOf(result.items))).toStrictEqual([
      [5, 4],
      [3, 2],
      [1],
    ]);
    expect(pages.map((result) => result.total)).toStrictEqual([5, 5, 5]);
  });

  it("returns an empty page past the last one", () => {
    expect(select(FIVE, { limit: 2, page: 4 })).toStrictEqual({
      items: [],
      total: 5,
    });
  });

  it("counts only the filtered reviews in the total", () => {
    const reviews = [
      buildReview({ id: 1, rating: 5 }),
      buildReview({ id: 2, rating: 1 }),
      buildReview({ id: 3, rating: 5 }),
    ];

    expect(select(reviews, { rating: 5, limit: 1, page: 2 })).toStrictEqual({
      items: [reviews[0]],
      total: 2,
    });
  });

  it.each([
    ["date", "desc"],
    ["date", "asc"],
    ["rating", "desc"],
    ["rating", "asc"],
  ] as const)(
    "walking every page of a tie-heavy fixture for sort=%s order=%s has no gap and no duplicate",
    (sort, order) => {
      const tieHeavy = Array.from({ length: 27 }, (_unused, index) =>
        buildReview({
          id: ((index * 7) % 27) + 1,
          rating: 3 + (index % 3),
          createdAtMs: 1000 * ((index % 2) + 1),
        }),
      );
      const full = select(tieHeavy, { sort, order, limit: 100 });
      const walked = [1, 2, 3, 4, 5, 6, 7].flatMap(
        (page) => select(tieHeavy, { sort, order, limit: 4, page }).items,
      );

      expect(full.total).toBe(27);
      expect(new Set(idsOf(walked)).size).toBe(27);
      expect(idsOf(walked)).toStrictEqual(idsOf(full.items));
    },
  );
});
