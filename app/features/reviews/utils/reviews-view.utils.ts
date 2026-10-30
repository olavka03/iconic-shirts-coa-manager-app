import { SHOP_LEVEL_PRODUCT_EXTERNAL_ID } from "~/features/reviews/constants/reviews.constants";
import type { JudgeReview } from "~/features/reviews/types/judge-review.types";
import type {
  PublicReview,
  ReviewsQuery,
  ReviewsResponse,
} from "~/features/reviews/types/reviews-api.types";

function trimmedOrNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";

  return trimmed === "" ? null : trimmed;
}

export function toPublicReview(review: JudgeReview): PublicReview {
  return {
    id: review.id,
    rating: review.rating,
    title: trimmedOrNull(review.title),
    body: review.body.trim(),
    created_at: new Date(review.createdAtMs).toISOString(),
    reviewer_name: trimmedOrNull(review.reviewerName),
    verified: review.verified,
    source: review.source,
    product:
      review.productExternalId === SHOP_LEVEL_PRODUCT_EXTERNAL_ID
        ? null
        : {
            id: review.productExternalId,
            handle: review.productHandle,
            title: review.productTitle,
          },
  };
}

export function toReviewsResponse(
  selection: { items: JudgeReview[]; total: number },
  query: ReviewsQuery,
): ReviewsResponse {
  return {
    reviews: selection.items.map(toPublicReview),
    pagination: {
      page: query.page,
      limit: query.limit,
      total: selection.total,
      total_pages: Math.ceil(selection.total / query.limit),
    },
  };
}
