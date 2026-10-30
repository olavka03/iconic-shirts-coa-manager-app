import { describe, expect, it } from "vitest";
import type { JudgeReview } from "~/features/reviews/types/judge-review.types";
import type { ReviewsQuery } from "~/features/reviews/types/reviews-api.types";
import { toPublicReview, toReviewsResponse } from "./reviews-view.utils";

const SHOP_LEVEL_HANDLE = "judgeme-shop-reviews";
const PII_MARKERS = [
  "pii-email@example.test",
  "PIIMARKER",
  "192.0.2.250",
  "777000777",
];
const PII_KEYS = ["email", "phone", "ip_address", "reviewerId"];

function buildReview(overrides: Partial<JudgeReview> = {}): JudgeReview {
  return {
    id: 900000001,
    rating: 5,
    title: null,
    body: "Arrived quickly and exactly as described.\nThe frame is superb.",
    createdAtMs: Date.UTC(2026, 9, 29, 18, 52, 50),
    reviewerName: "Alex Example",
    source: "shop-app",
    verified: "verified-purchase",
    productExternalId: 1234567890123,
    productHandle: "example-signed-shirt",
    productTitle: "Example Signed Shirt",
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

function leakyReview(): JudgeReview {
  return {
    ...buildReview(),
    email: "pii-email@example.test",
    phone: "PIIMARKER",
    ip_address: "192.0.2.250",
    reviewerId: 777000777,
  } as JudgeReview;
}

describe("toPublicReview", () => {
  it("exposes exactly the documented keys in order", () => {
    const publicReview = toPublicReview(buildReview());

    expect(Object.keys(publicReview)).toStrictEqual([
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
    expect(Object.keys(publicReview.product ?? {})).toStrictEqual([
      "id",
      "handle",
      "title",
    ]);
  });

  it("builds the documented example", () => {
    expect(toPublicReview(buildReview())).toStrictEqual({
      id: 900000001,
      rating: 5,
      title: null,
      body: "Arrived quickly and exactly as described.\nThe frame is superb.",
      created_at: "2026-10-29T18:52:50.000Z",
      reviewer_name: "Alex Example",
      verified: "verified-purchase",
      source: "shop-app",
      product: {
        id: 1234567890123,
        handle: "example-signed-shirt",
        title: "Example Signed Shirt",
      },
    });
  });

  it("drops every property that is not part of the public shape", () => {
    const serialised = JSON.stringify(toPublicReview(leakyReview()));

    for (const marker of PII_MARKERS) {
      expect(serialised).not.toContain(marker);
    }

    for (const key of PII_KEYS) {
      expect(serialised).not.toContain(key);
    }

    expect(Object.keys(toPublicReview(leakyReview()))).toHaveLength(9);
  });

  it("does not expose the internal visibility fields", () => {
    const serialised = JSON.stringify(toPublicReview(buildReview()));

    for (const key of ["published", "hidden", "curated", "createdAtMs"]) {
      expect(serialised).not.toContain(key);
    }
  });

  it("gives a null product for a shop-level review", () => {
    const shopLevel = toPublicReview(
      buildReview({
        productExternalId: 0,
        productHandle: SHOP_LEVEL_HANDLE,
        productTitle: "Shop reviews",
      }),
    );

    expect(shopLevel.product).toBeNull();
    expect(JSON.stringify(shopLevel)).not.toContain(SHOP_LEVEL_HANDLE);
    expect(JSON.stringify(shopLevel)).not.toContain("Shop reviews");
  });

  it.each([[null], [""], ["  "], ["\n\t "]])(
    "gives a null title for %j",
    (title) => {
      expect(toPublicReview(buildReview({ title })).title).toBeNull();
    },
  );

  it("trims a title", () => {
    expect(
      toPublicReview(buildReview({ title: "  Great shirt \n" })).title,
    ).toBe("Great shirt");
  });

  it("trims the body and keeps inner line breaks", () => {
    expect(
      toPublicReview(buildReview({ body: "  First line\nSecond line \r\n" }))
        .body,
    ).toBe("First line\nSecond line");
  });

  it("keeps an empty body as an empty string", () => {
    expect(toPublicReview(buildReview({ body: " \n " })).body).toBe("");
  });

  it("trims the reviewer name and gives null when blank", () => {
    expect(
      toPublicReview(buildReview({ reviewerName: "  Alex Example " }))
        .reviewer_name,
    ).toBe("Alex Example");

    for (const reviewerName of [null, "", "   "]) {
      expect(
        toPublicReview(buildReview({ reviewerName })).reviewer_name,
      ).toBeNull();
    }
  });

  it.each(["José Müller-Łukasiewicz", "Sam 🎉", "Zoë"])(
    "leaves the name %j unchanged",
    (reviewerName) => {
      expect(toPublicReview(buildReview({ reviewerName })).reviewer_name).toBe(
        reviewerName,
      );
    },
  );

  it("passes verified and source through as Judge returned them", () => {
    const publicReview = toPublicReview(
      buildReview({ verified: "nothing", source: "google-business" }),
    );

    expect(publicReview.verified).toBe("nothing");
    expect(publicReview.source).toBe("google-business");
  });

  it("normalises the creation time to UTC with milliseconds", () => {
    expect(
      toPublicReview(
        buildReview({ createdAtMs: Date.UTC(2026, 9, 29, 18, 52, 50) }),
      ).created_at,
    ).toBe("2026-10-29T18:52:50.000Z");
    expect(
      toPublicReview(
        buildReview({ createdAtMs: Date.UTC(2026, 0, 2, 3, 4, 5, 6) }),
      ).created_at,
    ).toBe("2026-01-02T03:04:05.006Z");
  });
});

describe("toReviewsResponse", () => {
  it("builds the envelope with the documented keys in order", () => {
    const response = toReviewsResponse(
      { items: [buildReview()], total: 1 },
      buildQuery(),
    );

    expect(Object.keys(response)).toStrictEqual(["reviews", "pagination"]);
    expect(Object.keys(response.pagination)).toStrictEqual([
      "page",
      "limit",
      "total",
      "total_pages",
    ]);
    expect(response.reviews).toStrictEqual([toPublicReview(buildReview())]);
  });

  it("counts 49 pages for 97 reviews at 2 per page", () => {
    const response = toReviewsResponse(
      { items: [], total: 97 },
      buildQuery({ limit: 2, page: 3 }),
    );

    expect(response.pagination).toStrictEqual({
      page: 3,
      limit: 2,
      total: 97,
      total_pages: 49,
    });
  });

  it("counts 0 pages for no reviews", () => {
    expect(
      toReviewsResponse({ items: [], total: 0 }, buildQuery()).pagination,
    ).toStrictEqual({ page: 1, limit: 50, total: 0, total_pages: 0 });
  });

  it("rounds a partial last page up", () => {
    expect(
      toReviewsResponse({ items: [], total: 5 }, buildQuery({ limit: 2 }))
        .pagination.total_pages,
    ).toBe(3);
    expect(
      toReviewsResponse({ items: [], total: 4 }, buildQuery({ limit: 2 }))
        .pagination.total_pages,
    ).toBe(2);
  });

  it("keeps every private value out of the serialised response", () => {
    const serialised = JSON.stringify(
      toReviewsResponse({ items: [leakyReview()], total: 1 }, buildQuery()),
    );

    for (const marker of PII_MARKERS) {
      expect(serialised).not.toContain(marker);
    }

    for (const key of PII_KEYS) {
      expect(serialised).not.toContain(key);
    }
  });
});
