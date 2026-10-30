import { SHOP_LEVEL_PRODUCT_EXTERNAL_ID } from "~/features/reviews/constants/reviews.constants";
import type { JudgeReview } from "~/features/reviews/types/judge-review.types";
import type { ReviewsQuery } from "~/features/reviews/types/reviews-api.types";

type ReviewsSelection = { items: JudgeReview[]; total: number };

export function isPubliclyVisible(review: JudgeReview): boolean {
  return review.published && !review.hidden && review.curated === "ok";
}

function matchesProduct(review: JudgeReview, query: ReviewsQuery): boolean {
  if (query.productId === null && query.productHandle === null) {
    return true;
  }

  if (review.productExternalId === SHOP_LEVEL_PRODUCT_EXTERNAL_ID) {
    return false;
  }

  if (query.productId !== null) {
    return review.productExternalId === query.productId;
  }

  return review.productHandle.toLowerCase() === query.productHandle;
}

function matchesQuery(review: JudgeReview, query: ReviewsQuery): boolean {
  return (
    matchesProduct(review, query) &&
    (query.rating === null || review.rating === query.rating) &&
    (query.minRating === null || review.rating >= query.minRating) &&
    (!query.hasText || review.body.trim() !== "")
  );
}

function compareNewestFirst(left: JudgeReview, right: JudgeReview): number {
  return right.createdAtMs - left.createdAtMs || right.id - left.id;
}

function buildComparator(
  query: ReviewsQuery,
): (left: JudgeReview, right: JudgeReview) => number {
  const direction = query.order === "asc" ? 1 : -1;

  return (left, right) => {
    const difference =
      query.sort === "rating"
        ? left.rating - right.rating
        : left.createdAtMs - right.createdAtMs;

    return direction * difference || compareNewestFirst(left, right);
  };
}

export function selectReviews(
  reviews: readonly JudgeReview[],
  query: ReviewsQuery,
): ReviewsSelection {
  const matching = reviews
    .filter((review) => matchesQuery(review, query))
    .sort(buildComparator(query));
  const start = (query.page - 1) * query.limit;

  return {
    items: matching.slice(start, start + query.limit),
    total: matching.length,
  };
}
