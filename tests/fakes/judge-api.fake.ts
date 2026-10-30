// An in-memory Judge.me reviews endpoint for tests (spec §2.2, §8). It stands in for globalThis.fetch,
// paginates the way Judge does and throws for anything not addressed to api.judge.me.

export const PII_MARKERS: readonly string[] = [
  "pii-email@example.test",
  "PIIMARKER",
  "192.0.2.250",
  "777000777",
];

const JUDGE_HOST = "api.judge.me";
const MAX_PER_PAGE = 100;
const DEFAULT_REVIEW_ID = 300001;
const NEWEST_REVIEW_TIME = Date.parse("2026-10-29T18:52:50+00:00");
const ONE_HOUR_MS = 3_600_000;
const AUTHENTICATION_FAILURE_BODY = {
  error: "Failed to authenticate. Shop domain or Api Token is wrong",
};

export type RawJudgeReviewer = {
  id: number;
  external_id: number;
  email: string;
  name: string;
  phone: string | null;
  accepts_marketing: boolean;
  unsubscribed_at: string | null;
  tags: string[];
};

export type RawJudgeReview = {
  id: number;
  title: string | null;
  body: string;
  rating: number;
  product_external_id: number;
  reviewer: RawJudgeReviewer;
  source: string;
  curated: string;
  published: boolean;
  hidden: boolean;
  verified: string;
  featured: boolean;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  has_published_pictures: boolean;
  has_published_videos: boolean;
  pictures: unknown[];
  ip_address: string | null;
  product_title: string;
  product_handle: string;
};

export type JudgeFailure =
  | { status: 401 | 403 | 404 | 429 | 500 | 503 }
  | { nonJson: true }
  | { network: true }
  | { hang: true }
  | { ignorePage: true };

export type FakeJudgeRequest = {
  shopDomain: string;
  apiToken: string;
  page: number;
  perPage: number;
  accept: string | null;
  hasSignal: boolean;
};

export type FakeJudge = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  requests: FakeJudgeRequest[];
  setReviews(reviews: unknown[]): void;
  setFailure(failure: JudgeFailure | null): void;
};

function judgeTimestamp(timeMs: number): string {
  return new Date(timeMs).toISOString().replace(".000Z", "+00:00");
}

export function rawJudgeReview(
  overrides: Partial<RawJudgeReview> = {},
): RawJudgeReview {
  const createdAt = judgeTimestamp(NEWEST_REVIEW_TIME);

  return {
    id: DEFAULT_REVIEW_ID,
    title: null,
    body: "Fits well and the print is sharp.",
    rating: 5,
    product_external_id: 70001021,
    reviewer: {
      id: 777000777,
      external_id: 777000777,
      email: "pii-email@example.test",
      name: "Alex Example",
      phone: "PIIMARKER-0100",
      accepts_marketing: true,
      unsubscribed_at: null,
      tags: ["PIIMARKER-tag"],
    },
    source: "shop-app",
    curated: "ok",
    published: true,
    hidden: false,
    verified: "verified-purchase",
    featured: false,
    pinned: false,
    created_at: createdAt,
    updated_at: createdAt,
    has_published_pictures: false,
    has_published_videos: false,
    pictures: [],
    ip_address: "192.0.2.250",
    product_title: "Iconic Test Shirt",
    product_handle: "iconic-test-shirt",
    ...overrides,
  };
}

export function rawJudgeReviews(
  count: number,
  overrides: (index: number) => Partial<RawJudgeReview> = () => ({}),
): RawJudgeReview[] {
  return Array.from(Array(count).keys(), (index) => {
    const createdAt = judgeTimestamp(NEWEST_REVIEW_TIME - index * ONE_HOUR_MS);

    return rawJudgeReview({
      id: DEFAULT_REVIEW_ID + index,
      created_at: createdAt,
      updated_at: createdAt,
      ...overrides(index),
    });
  });
}

function requestUrl(input: RequestInfo | URL): URL {
  if (typeof input === "string") {
    return new URL(input);
  }

  if (input instanceof URL) {
    return input;
  }

  return new URL(input.url);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function hangUntilAborted(signal: AbortSignal | null | undefined) {
  if (!signal) {
    throw new Error("The fake Judge hang failure needs a request signal.");
  }

  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }

  return new Promise<Response>((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    });
  });
}

export function createFakeJudge(
  options: { reviews?: unknown[]; failure?: JudgeFailure } = {},
): FakeJudge {
  const state = {
    reviews: options.reviews ?? [],
    failure: options.failure ?? null,
  };
  const requests: FakeJudgeRequest[] = [];

  const fetchJudge = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = requestUrl(input);

    if (url.hostname !== JUDGE_HOST) {
      throw new Error(
        `The fake Judge answers ${JUDGE_HOST} only, got ${url.hostname}.`,
      );
    }

    const page = Math.max(Number(url.searchParams.get("page") ?? 1), 1);
    const perPage = Number(url.searchParams.get("per_page") ?? MAX_PER_PAGE);

    requests.push({
      shopDomain: url.searchParams.get("shop_domain") ?? "",
      apiToken: url.searchParams.get("api_token") ?? "",
      page,
      perPage,
      accept: new Headers(init?.headers).get("Accept"),
      hasSignal: Boolean(init?.signal),
    });

    const { failure } = state;

    if (failure && "status" in failure) {
      return jsonResponse(
        failure.status === 401 ? AUTHENTICATION_FAILURE_BODY : {},
        failure.status,
      );
    }

    if (failure && "nonJson" in failure) {
      return new Response("<html><body>Service unavailable</body></html>", {
        headers: { "Content-Type": "text/html" },
      });
    }

    if (failure && "network" in failure) {
      throw new TypeError("fetch failed");
    }

    if (failure && "hang" in failure) {
      return hangUntilAborted(init?.signal);
    }

    const servedPage = failure && "ignorePage" in failure ? 1 : page;
    const servedPerPage = perPage === 0 ? 1 : Math.min(perPage, MAX_PER_PAGE);
    const start = (servedPage - 1) * servedPerPage;

    return jsonResponse({
      current_page: servedPage,
      per_page: servedPerPage,
      reviews: state.reviews.slice(start, start + servedPerPage),
    });
  };

  return {
    fetch: fetchJudge,
    requests,
    setReviews: (reviews) => {
      state.reviews = reviews;
    },
    setFailure: (failure) => {
      state.failure = failure;
    },
  };
}
