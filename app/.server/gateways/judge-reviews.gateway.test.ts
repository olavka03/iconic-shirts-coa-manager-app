import { afterEach, describe, expect, it, vi } from "vitest";
import { errorName } from "~/.server/logging/logger.service";
import {
  createFakeJudge,
  PII_MARKERS,
  rawJudgeReview,
  rawJudgeReviews,
  type FakeJudge,
  type JudgeFailure,
} from "../../../tests/fakes/judge-api.fake";
import {
  fetchAllJudgeReviews,
  JudgeReviewsError,
  type JudgeReviewsErrorKind,
} from "./judge-reviews.gateway";

const API_TOKEN = "judge-token-SECRET-123";
const SHOP_DOMAIN = "fake-shop.myshopify.com";
const FIRST_REVIEW_ID = 300001;
const JUDGE_REVIEW_KEYS = [
  "body",
  "createdAtMs",
  "curated",
  "hidden",
  "id",
  "productExternalId",
  "productHandle",
  "productTitle",
  "published",
  "rating",
  "reviewerName",
  "source",
  "title",
  "verified",
];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function fetchAll() {
  return fetchAllJudgeReviews({ shopDomain: SHOP_DOMAIN, apiToken: API_TOKEN });
}

function installFakeJudge(
  options?: Parameters<typeof createFakeJudge>[0],
): FakeJudge {
  const fake = createFakeJudge(options);
  vi.stubGlobal("fetch", fake.fetch);

  return fake;
}

function expectNoSecret(error: unknown) {
  expect(error).toBeInstanceOf(JudgeReviewsError);

  const judgeError = error as JudgeReviewsError;
  const ownProperties = Reflect.ownKeys(judgeError).flatMap((key) => [
    String(key),
    String(Reflect.get(judgeError, key)),
  ]);

  expect(
    [
      judgeError.message,
      judgeError.name,
      String(judgeError),
      JSON.stringify(judgeError),
      judgeError.stack ?? "",
      ...ownProperties,
    ].join("\n"),
  ).not.toContain(API_TOKEN);
  expect(judgeError.cause).toBeUndefined();
}

async function failureOf(promise: Promise<unknown>) {
  const outcome = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );

  expectNoSecret(outcome);

  return outcome as JudgeReviewsError;
}

function withoutKeys(review: object, keys: string[]): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...review };

  for (const key of keys) {
    delete copy[key];
  }

  return copy;
}

describe("fetchAllJudgeReviews: request shape", () => {
  it("sends one sequential, signed-in GET per page with the Judge query and a timeout signal", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const fake = installFakeJudge({ reviews: rawJudgeReviews(250) });
    const events: string[] = [];
    const sent: { url: URL; init: RequestInit | undefined }[] = [];

    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        events.push("start");
        sent.push({ url: new URL(String(input)), init });

        const response = await fake.fetch(input, init);

        events.push("end");

        return response;
      },
    );

    await fetchAll();

    expect(
      sent.map(({ url }) => `${url.protocol}//${url.host}${url.pathname}`),
    ).toEqual(Array(3).fill("https://api.judge.me/api/v1/reviews"));
    expect(sent.map(({ url }) => [...url.searchParams.keys()].sort())).toEqual(
      Array(3).fill(["api_token", "page", "per_page", "shop_domain"]),
    );
    expect(sent.map(({ init }) => init?.method ?? "GET")).toEqual([
      "GET",
      "GET",
      "GET",
    ]);
    expect(fake.requests).toEqual(
      [1, 2, 3].map((page) => ({
        shopDomain: SHOP_DOMAIN,
        apiToken: API_TOKEN,
        page,
        perPage: 100,
        accept: "application/json",
        hasSignal: true,
      })),
    );
    expect(timeoutSpy.mock.calls).toEqual([[8000], [8000], [8000]]);
    expect(events).toEqual(["start", "end", "start", "end", "start", "end"]);
  });
});

describe("fetchAllJudgeReviews: pagination", () => {
  it("reads 123 reviews in two requests", async () => {
    const fake = installFakeJudge({ reviews: rawJudgeReviews(123) });

    const result = await fetchAll();

    expect(result).toMatchObject({ pages: 2, truncated: false, skipped: 0 });
    expect(result.reviews).toHaveLength(123);
    expect(fake.requests).toHaveLength(2);
  });

  it("asks for a second page after exactly 100 reviews and finds it empty", async () => {
    const fake = installFakeJudge({ reviews: rawJudgeReviews(100) });

    const result = await fetchAll();

    expect(result.reviews).toHaveLength(100);
    expect(result).toMatchObject({ pages: 2, truncated: false });
    expect(fake.requests).toHaveLength(2);
  });

  it("reads 250 reviews in three requests", async () => {
    const fake = installFakeJudge({ reviews: rawJudgeReviews(250) });

    const result = await fetchAll();

    expect(result.reviews).toHaveLength(250);
    expect(result.pages).toBe(3);
    expect(fake.requests).toHaveLength(3);
  });

  it("answers an empty list after one request when the shop has no reviews", async () => {
    const fake = installFakeJudge({ reviews: [] });

    const result = await fetchAll();

    expect(result).toEqual({
      reviews: [],
      pages: 1,
      truncated: false,
      skipped: 0,
    });
    expect(fake.requests).toHaveLength(1);
  });

  it("stops when a page brings no new review id, for an API that ignores the page number", async () => {
    const fake = installFakeJudge({
      reviews: rawJudgeReviews(150),
      failure: { ignorePage: true },
    });

    const result = await fetchAll();

    expect(result.reviews).toHaveLength(100);
    expect(result.pages).toBe(2);
    expect(fake.requests).toHaveLength(2);
  });

  it("keeps a review repeated across pages once and does not count it as skipped", async () => {
    installFakeJudge({
      reviews: rawJudgeReviews(150, (index) =>
        index === 100 ? { id: FIRST_REVIEW_ID + 99 } : {},
      ),
    });

    const result = await fetchAll();

    expect(result.reviews).toHaveLength(149);
    expect(new Set(result.reviews.map(({ id }) => id))).toHaveProperty(
      "size",
      149,
    );
    expect(result.skipped).toBe(0);
  });
});

describe("fetchAllJudgeReviews: page cap", () => {
  it("stops at 50 pages, keeps the newest 5,000 and reports the truncation", async () => {
    const fake = installFakeJudge({ reviews: rawJudgeReviews(5200) });

    const result = await fetchAll();

    expect(fake.requests).toHaveLength(50);
    expect(result).toMatchObject({ pages: 50, truncated: true, skipped: 0 });
    expect(result.reviews).toHaveLength(5000);
    expect(result.reviews[0].id).toBe(FIRST_REVIEW_ID);
  });

  it("is not truncated when the 50th page is short", async () => {
    const fake = installFakeJudge({ reviews: rawJudgeReviews(4950) });

    const result = await fetchAll();

    expect(fake.requests).toHaveLength(50);
    expect(result).toMatchObject({ pages: 50, truncated: false });
    expect(result.reviews).toHaveLength(4950);
  });
});

describe("fetchAllJudgeReviews: load budget", () => {
  it("fails with a timeout when the first page used up the 30 second budget", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });

    const fake = createFakeJudge({ reviews: rawJudgeReviews(250) });

    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const response = await fake.fetch(input, init);

        if (fake.requests.length === 1) {
          vi.advanceTimersByTime(31_000);
        }

        return response;
      },
    );

    const error = await failureOf(fetchAll());

    expect(error.kind).toBe("timeout");
    expect(fake.requests).toHaveLength(1);
  });
});

describe("fetchAllJudgeReviews: narrowing", () => {
  it("skips rows that do not fit and counts them", async () => {
    installFakeJudge({
      reviews: [
        rawJudgeReview({ id: 1 }),
        42,
        rawJudgeReview({ id: "x" as unknown as number }),
        rawJudgeReview({ id: 2, rating: 6 }),
        rawJudgeReview({ id: 3, created_at: "not a date" }),
        rawJudgeReview({ id: 4, body: null as unknown as string }),
        rawJudgeReview({ id: 5 }),
      ],
    });

    const result = await fetchAll();

    expect(result.reviews.map(({ id }) => id)).toEqual([1, 5]);
    expect(result.skipped).toBe(5);
  });

  it("tolerates a missing title, reviewer, product handle, product title and external id", async () => {
    installFakeJudge({
      reviews: [
        {
          ...withoutKeys(rawJudgeReview({ id: 7 }), [
            "title",
            "product_handle",
            "product_title",
          ]),
          reviewer: null,
          product_external_id: null,
        },
      ],
    });

    const result = await fetchAll();

    expect(result.skipped).toBe(0);
    expect(result.reviews).toHaveLength(1);
    expect(result.reviews[0]).toMatchObject({
      id: 7,
      title: null,
      reviewerName: null,
      productHandle: "",
      productTitle: "",
      productExternalId: 0,
    });
  });

  it("treats a missing published or hidden flag as not visible and a missing curated as blank", async () => {
    installFakeJudge({
      reviews: [
        withoutKeys(rawJudgeReview({ id: 1 }), ["published"]),
        withoutKeys(rawJudgeReview({ id: 2 }), ["hidden"]),
        withoutKeys(rawJudgeReview({ id: 3 }), ["curated"]),
      ],
    });

    const [missingPublished, missingHidden, missingCurated] = (await fetchAll())
      .reviews;

    expect(missingPublished.published).toBe(false);
    expect(missingHidden.hidden).toBe(true);
    expect(missingCurated.curated).toBe("");
  });

  it("maps a full row to the review fields", async () => {
    installFakeJudge({
      reviews: [
        rawJudgeReview({
          id: 9,
          title: "Great",
          rating: 4,
          body: "Soft cotton.",
          source: "google-business",
          verified: "nothing",
          product_external_id: 0,
          product_handle: "judgeme-shop-reviews",
          product_title: "Judge.me Shop Reviews",
          curated: "ok",
          published: true,
          hidden: false,
          created_at: "2026-10-29T18:52:50+00:00",
        }),
      ],
    });

    const result = await fetchAll();

    expect(result.reviews).toEqual([
      {
        id: 9,
        rating: 4,
        title: "Great",
        body: "Soft cotton.",
        createdAtMs: Date.UTC(2026, 9, 29, 18, 52, 50),
        reviewerName: "Alex Example",
        source: "google-business",
        verified: "nothing",
        productExternalId: 0,
        productHandle: "judgeme-shop-reviews",
        productTitle: "Judge.me Shop Reviews",
        published: true,
        hidden: false,
        curated: "ok",
      },
    ]);
  });

  it("converts an offset timestamp to the same instant as its UTC form", async () => {
    installFakeJudge({
      reviews: [
        rawJudgeReview({ id: 1, created_at: "2026-10-29T20:00:00+02:00" }),
        rawJudgeReview({ id: 2, created_at: "2026-10-29T18:00:00+00:00" }),
      ],
    });

    const [offset, utc] = (await fetchAll()).reviews;

    expect(offset.createdAtMs).toBe(utc.createdAtMs);
    expect(utc.createdAtMs).toBe(Date.UTC(2026, 9, 29, 18, 0, 0));
  });

  it("keeps only the review fields and never lets reviewer details through", async () => {
    installFakeJudge({ reviews: rawJudgeReviews(3) });

    const result = await fetchAll();

    expect(result.reviews).toHaveLength(3);

    for (const review of result.reviews) {
      expect(Object.keys(review).sort()).toEqual(JUDGE_REVIEW_KEYS);
    }

    const serialized = JSON.stringify(result);

    for (const marker of PII_MARKERS) {
      expect(serialized).not.toContain(marker);
    }
  });
});

describe("fetchAllJudgeReviews: errors", () => {
  const STATUS_KINDS: {
    status: Extract<JudgeFailure, { status: number }>["status"];
    kind: JudgeReviewsErrorKind;
  }[] = [
    { status: 401, kind: "unauthorized" },
    { status: 403, kind: "unauthorized" },
    { status: 429, kind: "rate_limited" },
    { status: 500, kind: "upstream" },
    { status: 503, kind: "upstream" },
    { status: 404, kind: "upstream" },
  ];

  it.each(STATUS_KINDS)(
    "maps HTTP $status to $kind and keeps the status",
    async ({ status, kind }) => {
      installFakeJudge({ failure: { status } });

      const error = await failureOf(fetchAll());

      expect(error.kind).toBe(kind);
      expect(error.status).toBe(status);
    },
  );

  it("fails the whole load when a later page fails", async () => {
    const fake = createFakeJudge({ reviews: rawJudgeReviews(250) });

    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const response = await fake.fetch(input, init);

        fake.setFailure({ status: 503 });

        return response;
      },
    );

    const error = await failureOf(fetchAll());

    expect(error).toMatchObject({ kind: "upstream", status: 503 });
    expect(fake.requests).toHaveLength(2);
  });

  it("maps a body that is not JSON to invalid_response", async () => {
    installFakeJudge({ failure: { nonJson: true } });

    const error = await failureOf(fetchAll());

    expect(error.kind).toBe("invalid_response");
    expect(error.status).toBeUndefined();
  });

  it.each([
    ["an empty object", {}],
    ["a reviews field that is not a list", { reviews: {} }],
    ["a body that is null", null],
    ["a list instead of an object", []],
  ])("maps %s to invalid_response", async (_label, body) => {
    vi.stubGlobal("fetch", async () => Response.json(body));

    const error = await failureOf(fetchAll());

    expect(error.kind).toBe("invalid_response");
  });

  it("does not echo the body of an unreadable answer", async () => {
    vi.stubGlobal(
      "fetch",
      async () => new Response(`echo ${API_TOKEN} <html>`, { status: 200 }),
    );

    const error = await failureOf(fetchAll());

    expect(error.kind).toBe("invalid_response");
  });

  it("maps a rejected fetch to network without keeping its message, URL or cause", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      throw new TypeError(`fetch failed for ${String(input)}`, {
        cause: new Error(`socket closed for ${String(input)}`),
      });
    });

    const error = await failureOf(fetchAll());

    expect(error.kind).toBe("network");
    expect(error.status).toBeUndefined();
  });

  it.each([
    ["TimeoutError", "t"],
    ["AbortError", "a"],
  ])("maps a %s to timeout", async (name, message) => {
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(
      AbortSignal.abort(new DOMException(message, name)),
    );
    installFakeJudge({ failure: { hang: true } });

    const error = await failureOf(fetchAll());

    expect(error.kind).toBe("timeout");
  });

  it("maps an abort while the body is being read to timeout", async () => {
    vi.stubGlobal("fetch", async () => {
      const body = new ReadableStream({
        pull() {
          throw new DOMException("t", "TimeoutError");
        },
      });

      return new Response(body, { status: 200 });
    });

    const error = await failureOf(fetchAll());

    expect(error.kind).toBe("timeout");
  });
});

describe("JudgeReviewsError", () => {
  it("renders as JudgeReviewsError:<kind> in logs", () => {
    expect(errorName(new JudgeReviewsError("unauthorized"))).toBe(
      "JudgeReviewsError:unauthorized",
    );
  });

  it("gives not_configured a fixed message, a code and no status", () => {
    const error = new JudgeReviewsError("not_configured");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("JudgeReviewsError");
    expect(error.kind).toBe("not_configured");
    expect(error.code).toBe("not_configured");
    expect(error.status).toBeUndefined();
    expect(error.message).toBe(
      "The Judge.me reviews source is not configured.",
    );
  });

  it("uses a different fixed message for every kind", () => {
    const kinds: JudgeReviewsErrorKind[] = [
      "unauthorized",
      "rate_limited",
      "upstream",
      "timeout",
      "network",
      "invalid_response",
      "not_configured",
    ];

    const messages = kinds.map((kind) => new JudgeReviewsError(kind).message);

    expect(new Set(messages)).toHaveProperty("size", kinds.length);
    expect(new JudgeReviewsError("upstream", 502).message).toBe(
      new JudgeReviewsError("upstream", 500).message,
    );
  });
});
