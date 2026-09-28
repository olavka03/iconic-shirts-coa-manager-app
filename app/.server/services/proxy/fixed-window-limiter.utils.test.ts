import { describe, expect, it } from "vitest";
import {
  createFixedWindowLimiter,
  type FixedWindowLimiter,
} from "./fixed-window-limiter.utils";

const START = 1_800_000_000_000;

function allowTimes(
  limiter: FixedWindowLimiter,
  key: string,
  times: number,
  now: number,
): boolean[] {
  return Array.from({ length: times }, () => limiter.allow(key, now).allowed);
}

describe("createFixedWindowLimiter", () => {
  it("allows the limit within a window and denies the next request", () => {
    const limiter = createFixedWindowLimiter({
      limit: 20,
      windowMs: 60_000,
      maxKeys: 10_000,
    });

    expect(allowTimes(limiter, "shop|ip", 20, START)).toEqual(
      Array(20).fill(true),
    );
    expect(limiter.allow("shop|ip", START + 59_999).allowed).toBe(false);
  });

  it("starts a new window once windowMs has passed", () => {
    const limiter = createFixedWindowLimiter({
      limit: 20,
      windowMs: 60_000,
      maxKeys: 10_000,
    });

    allowTimes(limiter, "shop|ip", 21, START);

    expect(limiter.allow("shop|ip", START + 60_000).allowed).toBe(true);
    expect(allowTimes(limiter, "shop|ip", 19, START + 60_001)).toEqual(
      Array(19).fill(true),
    );
    expect(limiter.allow("shop|ip", START + 60_002).allowed).toBe(false);
  });

  it("counts every key on its own", () => {
    const limiter = createFixedWindowLimiter({
      limit: 2,
      windowMs: 60_000,
      maxKeys: 10_000,
    });

    allowTimes(limiter, "shop|first", 2, START);

    expect(limiter.allow("shop|first", START).allowed).toBe(false);
    expect(limiter.allow("shop|second", START).allowed).toBe(true);
    expect(limiter.allow("other-shop|first", START).allowed).toBe(true);
  });

  it("never holds more than maxKeys keys and evicts the oldest first", () => {
    const limiter = createFixedWindowLimiter({
      limit: 1,
      windowMs: 60_000,
      maxKeys: 3,
    });

    for (const key of ["first", "second", "third", "fourth", "fifth"]) {
      limiter.allow(key, START);

      expect(limiter.size()).toBeLessThanOrEqual(3);
    }

    expect(limiter.size()).toBe(3);
    expect(limiter.allow("fifth", START).allowed).toBe(false);
    expect(limiter.allow("fourth", START).allowed).toBe(false);
    expect(limiter.allow("third", START).allowed).toBe(false);
    expect(limiter.allow("first", START).allowed).toBe(true);
  });

  it("treats a restarted window as the newest key", () => {
    const limiter = createFixedWindowLimiter({
      limit: 1,
      windowMs: 60_000,
      maxKeys: 2,
    });

    limiter.allow("first", START);
    limiter.allow("second", START + 1_000);
    limiter.allow("first", START + 60_000);
    limiter.allow("third", START + 60_000);

    expect(limiter.allow("first", START + 60_000).allowed).toBe(false);
    expect(limiter.allow("second", START + 60_000).allowed).toBe(true);
  });

  it("marks only the first denial of a key in each window", () => {
    const limiter = createFixedWindowLimiter({
      limit: 1,
      windowMs: 60_000,
      maxKeys: 10_000,
    });

    limiter.allow("shop|ip", START);

    expect(limiter.allow("shop|ip", START + 1)).toEqual({
      allowed: false,
      firstDenial: true,
    });
    expect(limiter.allow("shop|ip", START + 2)).toEqual({
      allowed: false,
      firstDenial: false,
    });
    expect(limiter.allow("other|ip", START + 2)).toEqual({ allowed: true });
    expect(limiter.allow("other|ip", START + 3)).toEqual({
      allowed: false,
      firstDenial: true,
    });
    expect(limiter.allow("shop|ip", START + 60_000)).toEqual({
      allowed: true,
    });
    expect(limiter.allow("shop|ip", START + 60_001)).toEqual({
      allowed: false,
      firstDenial: true,
    });
  });
});
