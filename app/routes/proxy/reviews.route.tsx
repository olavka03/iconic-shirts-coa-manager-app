import { JudgeReviewsError } from "~/.server/gateways/judge-reviews.gateway";
import { log } from "~/.server/logging/logger.service";
import { createFixedWindowLimiter } from "~/.server/services/proxy/fixed-window-limiter.utils";
import {
  clientAddress,
  proxyJsonResponse,
} from "~/.server/services/proxy/proxy-request.utils";
import { getVisibleReviews } from "~/.server/services/reviews/reviews-read.service";
import { checkProxySignature } from "~/.server/shopify/app-proxy-signature.service";
import {
  REVIEWS_RATE_LIMIT,
  REVIEWS_RATE_MAX_KEYS,
  REVIEWS_RATE_WINDOW_MS,
} from "~/features/reviews/constants/reviews.constants";
import type { ReviewsErrorBody } from "~/features/reviews/types/reviews-api.types";
import { parseReviewsQuery } from "~/features/reviews/utils/reviews-query.utils";
import { selectReviews } from "~/features/reviews/utils/reviews-select.utils";
import { toReviewsResponse } from "~/features/reviews/utils/reviews-view.utils";
import type { Route } from "./+types/reviews.route";

const limiter = createFixedWindowLimiter({
  limit: REVIEWS_RATE_LIMIT,
  windowMs: REVIEWS_RATE_WINDOW_MS,
  maxKeys: REVIEWS_RATE_MAX_KEYS,
});

export async function loader({ request }: Route.LoaderArgs) {
  await checkProxySignature(request);

  const url = new URL(request.url);
  // Covered by the signature, so it is safe to use as the tenant key.
  const shop = url.searchParams.get("shop") ?? "";

  const decision = limiter.allow(`${shop}|${clientAddress(request)}`);

  if (!decision.allowed) {
    if (decision.firstDenial) {
      log.warn("reviews.rate_limited", { shop });
    }

    return proxyJsonResponse(
      { error: "rate_limited" } satisfies ReviewsErrorBody,
      429,
      { "Retry-After": String(REVIEWS_RATE_WINDOW_MS / 1000) },
    );
  }

  const parsed = parseReviewsQuery(url.searchParams);

  if (!parsed.ok) {
    return proxyJsonResponse(
      {
        error: "invalid_parameter",
        parameter: parsed.parameter,
      } satisfies ReviewsErrorBody,
      400,
    );
  }

  try {
    const reviews = await getVisibleReviews(shop);

    return proxyJsonResponse(
      toReviewsResponse(selectReviews(reviews, parsed.query), parsed.query),
    );
  } catch (error) {
    if (error instanceof JudgeReviewsError) {
      return proxyJsonResponse(
        { error: "reviews_unavailable" } satisfies ReviewsErrorBody,
        503,
      );
    }

    throw error;
  }
}
