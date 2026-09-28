import { HttpResponseError, InvalidJwtError } from "@shopify/shopify-api";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  errorName,
  log,
  setLogSink,
  timed,
  type LogLine,
} from "./logger.service";

afterEach(() => {
  setLogSink(null);
  vi.restoreAllMocks();
});

describe("log", () => {
  it("emits one structured line per call and never lets fields override level or event", () => {
    const lines: LogLine[] = [];
    setLogSink((line) => lines.push(line));
    log.error("mirror.sync_failed", {
      shop: "a.myshopify.com",
      certificateId: 4,
      level: "info",
      event: "x",
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: "error",
      event: "mirror.sync_failed",
      shop: "a.myshopify.com",
      certificateId: 4,
    });
    expect(typeof lines[0].time).toBe("string");
  });
  it("names errors without their messages", () => {
    expect(errorName(new Response(null, { status: 503 }))).toBe("http_503");
    expect(errorName(Object.assign(new Error("boom"), { code: "P2002" }))).toBe(
      "Error:P2002",
    );
    expect(errorName(new TypeError("fetch failed"))).toBe("TypeError");
    expect(errorName("x")).toBe("string");
  });
  it("names Shopify library errors by their class", () => {
    expect(errorName(new InvalidJwtError("expired"))).toBe("InvalidJwtError");
    expect(
      errorName(
        new HttpResponseError({
          message: "Bad request",
          code: 400,
          statusText: "",
        }),
      ),
    ).toBe("HttpResponseError");
  });
});

describe("timed", () => {
  it("returns the value with the whole milliseconds it took", async () => {
    vi.spyOn(performance, "now")
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(142.6);

    await expect(timed(async () => "done")).resolves.toEqual({
      value: "done",
      elapsedMs: 43,
    });
  });
});
