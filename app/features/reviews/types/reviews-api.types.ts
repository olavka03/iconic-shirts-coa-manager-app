export type ReviewsParameterName =
  | "limit"
  | "page"
  | "sort"
  | "order"
  | "product_id"
  | "product_handle"
  | "rating"
  | "min_rating"
  | "has_text";

export type ReviewsQuery = {
  limit: number;
  page: number;
  sort: "date" | "rating";
  order: "asc" | "desc";
  productId: number | null;
  productHandle: string | null;
  rating: number | null;
  minRating: number | null;
  hasText: boolean;
};

export type ReviewsQueryResult =
  | { ok: true; query: ReviewsQuery }
  | { ok: false; parameter: ReviewsParameterName };

export type PublicReview = {
  id: number;
  rating: number;
  title: string | null;
  body: string;
  created_at: string;
  reviewer_name: string | null;
  verified: string;
  source: string;
  product: { id: number; handle: string; title: string } | null;
};

export type ReviewsResponse = {
  reviews: PublicReview[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
};

export type ReviewsErrorBody =
  | { error: "invalid_parameter"; parameter: ReviewsParameterName }
  | { error: "rate_limited" }
  | { error: "reviews_unavailable" };
