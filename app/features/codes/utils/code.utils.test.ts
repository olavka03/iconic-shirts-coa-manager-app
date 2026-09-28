import { describe, expect, it } from "vitest";
import {
  CODE_PATTERN,
  codeError,
  codePrefixFor,
  codeToHandle,
  handleToCode,
  normalizeCode,
  normalizeRawCode,
  parseCode,
} from "./code.utils";

describe("normalizeCode", () => {
  it.each([
    [" is141909 ars0 ", "IS141909ARS0"],
    ["IS141060\u2013tkrm", "IS141060-TKRM"],
    ["IS141060\u2212TKRM", "IS141060-TKRM"],
    ["IS\u00a0141909", "IS141909"],
    ["\uff29\uff33\uff11\uff14\uff11\uff19\uff10\uff19", "IS141909"],
  ])("%j → %s", (raw, code) => expect(normalizeCode(raw)).toBe(code));
});

describe("normalizeRawCode", () => {
  it("reads only the first 64 characters of what was typed", () => {
    expect(normalizeRawCode(`${" ".repeat(64)}IS141909ARS0`)).toBe("");
    expect(normalizeRawCode(`${" ".repeat(52)}IS141909ARS0`)).toBe(
      "IS141909ARS0",
    );
  });
});

describe("codeError", () => {
  it("checks empty, then characters, then length", () => {
    expect(codeError("")).toBe("Enter a certificate code.");
    expect(codeError("IS-")).toBe("Use only letters, numbers, and hyphens.");
    expect(codeError("IS_1")).toBe("Use only letters, numbers, and hyphens.");
    expect(codeError("AB")).toBe("Use between 4 and 32 characters.");
    expect(codeError("A".repeat(33))).toBe("Use between 4 and 32 characters.");
    expect(codeError("IS141060-TKRM")).toBeNull();
  });
});

describe("handles", () => {
  it("are injective over the canonical charset", () => {
    const code = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123-9";
    expect(CODE_PATTERN.test(code)).toBe(true);
    expect(handleToCode(codeToHandle(code))).toBe(code);
    expect(codeToHandle("IS141060-TKRM")).toBe("is141060-tkrm");
  });
});

describe("parseCode", () => {
  it.each([
    [
      "IS141060-TKRM",
      undefined,
      { prefix: "IS", number: "141060", suffix: "TKRM", collision: null },
    ],
    [
      "IS141524IRL-2",
      undefined,
      { prefix: "IS", number: "141524", suffix: "IRL", collision: 2 },
    ],
    [
      "EXC100612",
      undefined,
      { prefix: "EXC", number: "100612", suffix: "", collision: null },
    ],
    [
      "ISEN1001DDP2526",
      "EN1001",
      { prefix: "ISEN", number: "1001", suffix: "DDP2526", collision: null },
    ],
    [
      "ISEN1001DDP2526",
      undefined,
      { prefix: "ISEN", number: "1001", suffix: "DDP2526", collision: null },
    ],
    [
      "IS141909ARS0",
      "#141909",
      { prefix: "IS", number: "141909", suffix: "ARS0", collision: null },
    ],
    [
      "IS141909UKRL",
      "#141909-UK",
      { prefix: "IS", number: "141909", suffix: "UKRL", collision: null },
    ],
    // The regex alone would split IS/7141909.
    [
      "IS7141909ARS0",
      "#141909",
      { prefix: "IS7", number: "141909", suffix: "ARS0", collision: null },
    ],
    // The order's digits aren't in the code, so the regex decides.
    [
      "IS141909ARS0",
      "#150000",
      { prefix: "IS", number: "141909", suffix: "ARS0", collision: null },
    ],
  ])("%s with order %s", (code, orderName, parsed) =>
    expect(parseCode(code, orderName)).toEqual(parsed),
  );

  it("returns null when the code doesn't start with letters and digits", () => {
    expect(parseCode("141909ABC")).toBeNull();
    expect(parseCode("ABCD")).toBeNull();
  });
});

describe("codePrefixFor", () => {
  it("keeps the saved code's own prefix", () => {
    expect(codePrefixFor("XY141909ARS0", "#141909", "IS")).toBe("XY");
  });
  it("keeps an empty prefix when the saved code starts with the order number", () => {
    expect(codePrefixFor("141909ARS0", "#141909", "IS")).toBe("");
  });
  it("falls back to the shop's prefix when the code can't be read", () => {
    expect(codePrefixFor("ABCD", null, "IS")).toBe("IS");
  });
});
