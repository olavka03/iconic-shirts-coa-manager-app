import { afterEach, describe, expect, it } from "vitest";
import { setLogSink, type LogLine } from "~/.server/logging/logger.service";
import {
  invalid,
  jsonResponse,
  notFoundJson,
  parseIdParam,
  readJsonBody,
  throwNotFound,
  unavailable,
  withJsonErrors,
} from "./json-response.utils";

function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }

  return undefined;
}

afterEach(() => {
  setLogSink(null);
});

describe("http helpers", () => {
  it.each([
    [
      "0192f3a4-5b6c-7d8e-9f01-23456789abcd",
      "0192f3a4-5b6c-7d8e-9f01-23456789abcd",
    ],
    [
      "0192F3A4-5B6C-7D8E-9F01-23456789ABCD",
      "0192f3a4-5b6c-7d8e-9f01-23456789abcd",
    ],
    ["42", null],
    ["0192f3a4-5b6c-7d8e-9f01-23456789abcd0", null],
    ["0192f3a4-5b6c-7d8e-9f01-23456789abcg", null],
    ["", null],
    [undefined, null],
    [null, null],
  ])("parseIdParam(%j) = %j", (raw, id) =>
    expect(parseIdParam(raw as string | undefined)).toBe(id),
  );
  it("builds the 503 and 422 bodies", async () => {
    expect(unavailable().status).toBe(503);
    expect(await unavailable().json()).toEqual({
      ok: false,
      formError: "unavailable",
    });
    expect(await invalid({ fieldErrors: { code: "x" } }).json()).toEqual({
      ok: false,
      fieldErrors: { code: "x" },
    });
  });
  it("never caches JSON, answers 404 bodies and throws a 404 route error", async () => {
    const response = jsonResponse({ ok: true }, 200, { "X-Test": "1" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Test")).toBe("1");
    expect(notFoundJson().status).toBe(404);
    expect(await notFoundJson().json()).toEqual({
      ok: false,
      formError: "not_found",
    });
    expect(thrownBy(throwNotFound)).toMatchObject({ init: { status: 404 } });
  });
  it("reads JSON bodies and returns undefined for garbage", async () => {
    expect(
      await readJsonBody(
        new Request("https://a.test", { method: "POST", body: '{"a":1}' }),
      ),
    ).toEqual({ a: 1 });
    expect(
      await readJsonBody(
        new Request("https://a.test", { method: "POST", body: "{" }),
      ),
    ).toBeUndefined();
  });
  it("re-throws Responses and turns other failures into a logged 503", async () => {
    const lines: LogLine[] = [];
    setLogSink((line) => lines.push(line));
    const unauthorized = new Response(null, { status: 401 });
    await expect(
      withJsonErrors("x.failed", async () => {
        throw unauthorized;
      }),
    ).rejects.toBe(unauthorized);
    const response = await withJsonErrors("x.failed", async () => {
      throw new Error("db down");
    });
    expect(response.status).toBe(503);
    expect(lines).toEqual([
      expect.objectContaining({
        level: "error",
        event: "x.failed",
        error: "Error",
      }),
    ]);
  });
});
