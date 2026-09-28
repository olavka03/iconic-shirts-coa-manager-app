// firstDenial is true once per key and window, so a client over the limit is logged once.
export type RateDecision =
  { allowed: true } | { allowed: false; firstDenial: boolean };

export type FixedWindowLimiter = {
  allow(key: string, now?: number): RateDecision;
  size(): number;
};

type KeyWindow = { windowStart: number; count: number; denied: boolean };

export function createFixedWindowLimiter(options: {
  limit: number;
  windowMs: number;
  maxKeys: number;
}): FixedWindowLimiter {
  const windows = new Map<string, KeyWindow>();

  // A Map iterates in insertion order, so the first keys are the oldest windows.
  function evictOldest(): void {
    for (const key of windows.keys()) {
      if (windows.size <= options.maxKeys) {
        return;
      }

      windows.delete(key);
    }
  }

  function startWindow(key: string, now: number): void {
    windows.delete(key);
    windows.set(key, { windowStart: now, count: 1, denied: false });
    evictOldest();
  }

  return {
    allow(key, now = Date.now()) {
      const current = windows.get(key);

      if (!current || now - current.windowStart >= options.windowMs) {
        startWindow(key, now);

        return { allowed: true };
      }

      if (current.count >= options.limit) {
        const firstDenial = !current.denied;

        current.denied = true;

        return { allowed: false, firstDenial };
      }

      current.count += 1;

      return { allowed: true };
    },
    size: () => windows.size,
  };
}
