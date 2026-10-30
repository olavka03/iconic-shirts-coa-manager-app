export type JudgeReview = {
  id: number;
  rating: number;
  title: string | null;
  body: string;
  createdAtMs: number;
  reviewerName: string | null;
  source: string;
  verified: string;
  productExternalId: number;
  productHandle: string;
  productTitle: string;
  published: boolean;
  hidden: boolean;
  curated: string;
};
