import {
  fetchAllJudgeReviews,
  JudgeReviewsError,
} from "~/.server/gateways/judge-reviews.gateway";
import { log, timed } from "~/.server/logging/logger.service";
import {
  CACHE_FAILURE_RETRY_MS,
  CACHE_MAX_KEYS,
  CACHE_MAX_STALE_MS,
  CACHE_TTL_MS,
} from "~/features/reviews/constants/reviews.constants";
import type { JudgeReview } from "~/features/reviews/types/judge-review.types";
import { isPubliclyVisible } from "~/features/reviews/utils/reviews-select.utils";
import {
  createReviewsCache,
  type LoadedReviews,
} from "./reviews-cache.service";

const announcedOverrides = new Set<string>();

function readEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

async function loadVisibleReviews(shopDomain: string): Promise<LoadedReviews> {
  const apiToken = readEnv("JUDGE_API_TOKEN");

  if (!apiToken) {
    throw new JudgeReviewsError("not_configured");
  }

  const { value: load, elapsedMs } = await timed(() =>
    fetchAllJudgeReviews({ shopDomain, apiToken }),
  );
  const reviews = load.reviews.filter(isPubliclyVisible);

  log.info("reviews.loaded", {
    shop: shopDomain,
    count: reviews.length,
    pages: load.pages,
    elapsedMs,
  });

  if (load.truncated) {
    log.warn("reviews.page_cap_reached", {
      shop: shopDomain,
      pages: load.pages,
    });
  }

  if (load.skipped > 0) {
    log.warn("reviews.malformed_skipped", {
      shop: shopDomain,
      count: load.skipped,
    });
  }

  return { reviews, truncated: load.truncated };
}

export const reviewsCache = createReviewsCache({
  load: loadVisibleReviews,
  ttlMs: CACHE_TTL_MS,
  maxStaleMs: CACHE_MAX_STALE_MS,
  failureRetryMs: CACHE_FAILURE_RETRY_MS,
  maxKeys: CACHE_MAX_KEYS,
});

export async function getVisibleReviews(
  proxyShop: string,
): Promise<JudgeReview[]> {
  const override = readEnv("JUDGE_SHOP_DOMAIN");
  const shopDomain = override || proxyShop.trim().toLowerCase();

  if (!shopDomain) {
    throw new JudgeReviewsError("not_configured");
  }

  if (override && !announcedOverrides.has(override)) {
    announcedOverrides.add(override);
    log.warn("reviews.shop_override_active", { shop: override });
  }

  const entry = await reviewsCache.get(shopDomain);

  return entry.reviews;
}
