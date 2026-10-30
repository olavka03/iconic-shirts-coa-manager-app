import {
  JUDGE_LOAD_BUDGET_MS,
  JUDGE_MAX_PAGES,
  JUDGE_PAGE_SIZE,
  JUDGE_REQUEST_TIMEOUT_MS,
} from "~/features/reviews/constants/reviews.constants";
import type { JudgeReview } from "~/features/reviews/types/judge-review.types";

const JUDGE_REVIEWS_URL = "https://api.judge.me/api/v1/reviews";
const MIN_RATING = 1;
const MAX_RATING = 5;

export type JudgeReviewsErrorKind =
  | "unauthorized"
  | "rate_limited"
  | "upstream"
  | "timeout"
  | "network"
  | "invalid_response"
  | "not_configured";

type JudgeReviewsOptions = { shopDomain: string; apiToken: string };

type JudgeReviewsLoad = {
  reviews: JudgeReview[];
  pages: number;
  truncated: boolean;
  skipped: number;
};

type RawRecord = Record<string, unknown>;

const ERROR_MESSAGES: Record<JudgeReviewsErrorKind, string> = {
  unauthorized: "Judge.me rejected the credentials.",
  rate_limited: "Judge.me is limiting requests.",
  upstream: "Judge.me answered with an error status.",
  timeout: "Judge.me did not answer in time.",
  network: "The request to Judge.me failed.",
  invalid_response: "Judge.me sent an unreadable answer.",
  not_configured: "The Judge.me reviews source is not configured.",
};

export class JudgeReviewsError extends Error {
  readonly kind: JudgeReviewsErrorKind;
  readonly code: JudgeReviewsErrorKind;
  readonly status?: number;

  constructor(kind: JudgeReviewsErrorKind, status?: number) {
    super(ERROR_MESSAGES[kind]);
    this.name = "JudgeReviewsError";
    this.kind = kind;
    this.code = kind;
    this.status = status;
  }
}

function isRecord(value: unknown): value is RawRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStopSignal(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

function stringOr<Fallback extends string | null>(
  value: unknown,
  fallback: Fallback,
): string | Fallback {
  return typeof value === "string" ? value : fallback;
}

function integerOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value)
    ? value
    : fallback;
}

function narrowReview(raw: unknown): JudgeReview | null {
  if (!isRecord(raw)) {
    return null;
  }

  const { id, rating, body } = raw;
  const createdAtMs =
    typeof raw.created_at === "string"
      ? Date.parse(raw.created_at)
      : Number.NaN;

  if (
    typeof id !== "number" ||
    !Number.isInteger(id) ||
    typeof rating !== "number" ||
    !Number.isInteger(rating) ||
    rating < MIN_RATING ||
    rating > MAX_RATING ||
    typeof body !== "string" ||
    Number.isNaN(createdAtMs)
  ) {
    return null;
  }

  return {
    id,
    rating,
    title: stringOr(raw.title, null),
    body,
    createdAtMs,
    reviewerName: isRecord(raw.reviewer)
      ? stringOr(raw.reviewer.name, null)
      : null,
    source: stringOr(raw.source, ""),
    verified: stringOr(raw.verified, ""),
    productExternalId: integerOr(raw.product_external_id, 0),
    productHandle: stringOr(raw.product_handle, ""),
    productTitle: stringOr(raw.product_title, ""),
    // A missing flag must never publish a review, so hidden is true unless Judge says false.
    published: raw.published === true,
    hidden: raw.hidden !== false,
    curated: stringOr(raw.curated, ""),
  };
}

async function requestPage(url: URL): Promise<Response> {
  try {
    return await globalThis.fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(JUDGE_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new JudgeReviewsError(isStopSignal(error) ? "timeout" : "network");
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new JudgeReviewsError(
      isStopSignal(error) ? "timeout" : "invalid_response",
    );
  }
}

function failureForStatus(status: number): JudgeReviewsError {
  if (status === 401 || status === 403) {
    return new JudgeReviewsError("unauthorized", status);
  }

  if (status === 429) {
    return new JudgeReviewsError("rate_limited", status);
  }

  return new JudgeReviewsError("upstream", status);
}

async function fetchRawPage(
  options: JudgeReviewsOptions,
  page: number,
): Promise<unknown[]> {
  const url = new URL(JUDGE_REVIEWS_URL);

  url.searchParams.set("shop_domain", options.shopDomain);
  url.searchParams.set("api_token", options.apiToken);
  url.searchParams.set("per_page", String(JUDGE_PAGE_SIZE));
  url.searchParams.set("page", String(page));

  const response = await requestPage(url);

  if (!response.ok) {
    throw failureForStatus(response.status);
  }

  const body = await readJson(response);

  if (!isRecord(body) || !Array.isArray(body.reviews)) {
    throw new JudgeReviewsError("invalid_response");
  }

  return body.reviews;
}

export async function fetchAllJudgeReviews(
  options: JudgeReviewsOptions,
): Promise<JudgeReviewsLoad> {
  const reviewsById = new Map<number, JudgeReview>();
  const startedAt = Date.now();
  let skipped = 0;

  for (let page = 1; page <= JUDGE_MAX_PAGES; page += 1) {
    if (page > 1 && Date.now() - startedAt >= JUDGE_LOAD_BUDGET_MS) {
      throw new JudgeReviewsError("timeout");
    }

    const rows = await fetchRawPage(options, page);
    const knownCount = reviewsById.size;

    for (const row of rows) {
      const review = narrowReview(row);

      if (review) {
        reviewsById.set(review.id, review);
      } else {
        skipped += 1;
      }
    }

    const hasNewReview = reviewsById.size > knownCount;

    if (rows.length < JUDGE_PAGE_SIZE || !hasNewReview) {
      return {
        reviews: [...reviewsById.values()],
        pages: page,
        truncated: false,
        skipped,
      };
    }
  }

  return {
    reviews: [...reviewsById.values()],
    pages: JUDGE_MAX_PAGES,
    truncated: true,
    skipped,
  };
}
