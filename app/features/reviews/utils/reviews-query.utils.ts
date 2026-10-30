import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
} from "~/features/reviews/constants/reviews.constants";
import type {
  ReviewsParameterName,
  ReviewsQuery,
  ReviewsQueryResult,
} from "~/features/reviews/types/reviews-api.types";

type Rejected = { ok: false; parameter: ReviewsParameterName };
type Parsed<Value> = { ok: true; value: Value } | Rejected;
type Convert<Value> = (raw: string) => Value | undefined;

const INTEGER_PATTERN = /^-?\d{1,9}$/;
const RATING_PATTERN = /^\d$/;
const PRODUCT_ID_PATTERN = /^[1-9]\d{0,15}$/;
const PRODUCT_HANDLE_PATTERN = /^[\p{L}\p{N}_-]+$/u;
const PRODUCT_HANDLE_MAX_LENGTH = 255;
const MIN_CLAMPED_VALUE = 1;
const MIN_RATING = 1;
const MAX_RATING = 5;
const SORTS = ["date", "rating"] as const;
const ORDERS = ["asc", "desc"] as const;
const HAS_TEXT_VALUES = new Map([
  ["1", true],
  ["true", true],
  ["0", false],
  ["false", false],
]);

function accepted<Value>(value: Value): Parsed<Value> {
  return { ok: true, value };
}

function rejected(parameter: ReviewsParameterName): Rejected {
  return { ok: false, parameter };
}

function hasValue(
  searchParams: URLSearchParams,
  parameter: ReviewsParameterName,
): boolean {
  return searchParams.getAll(parameter).some((value) => value !== "");
}

function parseWithDefault<Value>(
  searchParams: URLSearchParams,
  parameter: ReviewsParameterName,
  fallback: NoInfer<Value>,
  convert: Convert<Value>,
): Parsed<Value> {
  const values = searchParams.getAll(parameter);

  if (values.length > 1) {
    return rejected(parameter);
  }

  const [raw] = values;

  if (!raw) {
    return accepted(fallback);
  }

  const value = convert(raw);

  if (value === undefined) {
    return rejected(parameter);
  }

  return accepted(value);
}

function parseOptional<Value>(
  searchParams: URLSearchParams,
  parameter: ReviewsParameterName,
  convert: Convert<Value>,
): Parsed<Value | null> {
  return parseWithDefault<Value | null>(searchParams, parameter, null, convert);
}

function toClampedInteger(maxValue: number): Convert<number> {
  return (raw) => {
    if (!INTEGER_PATTERN.test(raw)) {
      return undefined;
    }

    return Math.min(maxValue, Math.max(MIN_CLAMPED_VALUE, Number(raw)));
  };
}

function toChoice<Choice extends string>(
  choices: readonly Choice[],
): Convert<Choice> {
  return (raw) => choices.find((choice) => choice === raw.trim());
}

// Out-of-range ratings are rejected, not clamped: clamping would silently change which reviews match.
function toRating(raw: string): number | undefined {
  if (!RATING_PATTERN.test(raw)) {
    return undefined;
  }

  const rating = Number(raw);

  if (rating < MIN_RATING || rating > MAX_RATING) {
    return undefined;
  }

  return rating;
}

function toHasText(raw: string): boolean | undefined {
  return HAS_TEXT_VALUES.get(raw.trim());
}

function toProductId(raw: string): number | undefined {
  if (!PRODUCT_ID_PATTERN.test(raw)) {
    return undefined;
  }

  const productId = Number(raw);

  return Number.isSafeInteger(productId) ? productId : undefined;
}

function toProductHandle(raw: string): string | undefined {
  if (
    !PRODUCT_HANDLE_PATTERN.test(raw) ||
    Array.from(raw).length > PRODUCT_HANDLE_MAX_LENGTH
  ) {
    return undefined;
  }

  return raw.toLowerCase();
}

export function parseReviewsQuery(
  searchParams: URLSearchParams,
): ReviewsQueryResult {
  const limit = parseWithDefault(
    searchParams,
    "limit",
    DEFAULT_LIMIT,
    toClampedInteger(MAX_LIMIT),
  );

  if (!limit.ok) {
    return limit;
  }

  const page = parseWithDefault(
    searchParams,
    "page",
    1,
    toClampedInteger(Number.POSITIVE_INFINITY),
  );

  if (!page.ok) {
    return page;
  }

  const sort = parseWithDefault(searchParams, "sort", "date", toChoice(SORTS));

  if (!sort.ok) {
    return sort;
  }

  const order = parseWithDefault(
    searchParams,
    "order",
    "desc",
    toChoice(ORDERS),
  );

  if (!order.ok) {
    return order;
  }

  if (
    hasValue(searchParams, "product_id") &&
    hasValue(searchParams, "product_handle")
  ) {
    return rejected("product_id");
  }

  const productId = parseOptional(searchParams, "product_id", toProductId);

  if (!productId.ok) {
    return productId;
  }

  const productHandle = parseOptional(
    searchParams,
    "product_handle",
    toProductHandle,
  );

  if (!productHandle.ok) {
    return productHandle;
  }

  const rating = parseOptional(searchParams, "rating", toRating);

  if (!rating.ok) {
    return rating;
  }

  const minRating = parseOptional(searchParams, "min_rating", toRating);

  if (!minRating.ok) {
    return minRating;
  }

  const hasText = parseWithDefault(searchParams, "has_text", false, toHasText);

  if (!hasText.ok) {
    return hasText;
  }

  const query: ReviewsQuery = {
    limit: limit.value,
    page: page.value,
    sort: sort.value,
    order: order.value,
    productId: productId.value,
    productHandle: productHandle.value,
    rating: rating.value,
    minRating: minRating.value,
    hasText: hasText.value,
  };

  return { ok: true, query };
}
