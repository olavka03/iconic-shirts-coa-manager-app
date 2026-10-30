import { JudgeReviewsError } from "~/.server/gateways/judge-reviews.gateway";
import { errorName, log } from "~/.server/logging/logger.service";
import type { JudgeReview } from "~/features/reviews/types/judge-review.types";

export type LoadedReviews = { reviews: JudgeReview[]; truncated: boolean };
export type ReviewsCacheEntry = LoadedReviews & { loadedAtMs: number };

export type ReviewsCache = {
  get(key: string): Promise<ReviewsCacheEntry>;
  clear(): void;
};

type KeyState = {
  entry: ReviewsCacheEntry | null;
  inFlight: Promise<ReviewsCacheEntry> | null;
  retryAfterMs: number;
  failure: unknown;
};

export function createReviewsCache(options: {
  load: (key: string) => Promise<LoadedReviews>;
  now?: () => number;
  ttlMs: number;
  maxStaleMs: number;
  failureRetryMs: number;
  maxKeys: number;
}): ReviewsCache {
  const states = new Map<string, KeyState>();
  const now = options.now ?? (() => Date.now());

  // A Map iterates in insertion order, so the first keys are the oldest.
  function evictOldest(): void {
    for (const key of states.keys()) {
      if (states.size <= options.maxKeys) {
        return;
      }

      states.delete(key);
    }
  }

  function stateFor(key: string): KeyState {
    const existing = states.get(key);

    if (existing) {
      return existing;
    }

    const created: KeyState = {
      entry: null,
      inFlight: null,
      retryAfterMs: 0,
      failure: null,
    };

    states.set(key, created);
    evictOldest();

    return created;
  }

  function isServable(entry: ReviewsCacheEntry | null): boolean {
    return entry !== null && now() - entry.loadedAtMs <= options.maxStaleMs;
  }

  async function runLoad(
    key: string,
    state: KeyState,
  ): Promise<ReviewsCacheEntry> {
    const servedStale = isServable(state.entry);

    try {
      const loaded = await options.load(key);
      const entry: ReviewsCacheEntry = { ...loaded, loadedAtMs: now() };

      state.entry = entry;
      state.retryAfterMs = 0;
      state.failure = null;

      return entry;
    } catch (error) {
      state.retryAfterMs = now() + options.failureRetryMs;
      state.failure = error;

      log[servedStale ? "warn" : "error"]("reviews.load_failed", {
        shop: key,
        kind: errorName(error),
        status: error instanceof JudgeReviewsError ? error.status : undefined,
        servedStale,
      });

      throw error;
    }
  }

  function startLoad(key: string, state: KeyState): Promise<ReviewsCacheEntry> {
    const inFlight = runLoad(key, state).finally(() => {
      state.inFlight = null;
    });

    state.inFlight = inFlight;

    return inFlight;
  }

  return {
    async get(key) {
      const state = stateFor(key);
      const currentMs = now();

      if (state.entry) {
        const ageMs = currentMs - state.entry.loadedAtMs;

        if (ageMs < options.ttlMs) {
          return state.entry;
        }

        if (ageMs <= options.maxStaleMs) {
          if (!state.inFlight && currentMs >= state.retryAfterMs) {
            startLoad(key, state).catch(() => undefined);
          }

          return state.entry;
        }
      }

      if (state.inFlight) {
        return state.inFlight;
      }

      if (currentMs < state.retryAfterMs) {
        throw state.failure;
      }

      return startLoad(key, state);
    },
    clear: () => states.clear(),
  };
}
