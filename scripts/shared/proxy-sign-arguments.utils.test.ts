import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROXY_PATH,
  parseExtraParameters,
  proxySignParameters,
} from "./proxy-sign-arguments.utils";

const SHOP = "example-shop.myshopify.com";
const TIMESTAMP = 1_790_000_000;

function sign(
  overrides: Partial<Parameters<typeof proxySignParameters>[0]> = {},
) {
  return proxySignParameters({
    path: DEFAULT_PROXY_PATH,
    code: "IS141909ARS0",
    shop: SHOP,
    extra: {},
    timestamp: TIMESTAMP,
    ...overrides,
  });
}

describe("parseExtraParameters", () => {
  it("splits every entry at the first equals sign", () => {
    expect(parseExtraParameters(["limit=5", "a=b=c", "empty="])).toEqual({
      limit: "5",
      a: "b=c",
      empty: "",
    });
  });

  it("keeps the last value of a repeated key", () => {
    expect(parseExtraParameters(["sort=date", "sort=rating"])).toEqual({
      sort: "rating",
    });
  });

  it("returns an empty object for no entries", () => {
    expect(parseExtraParameters([])).toEqual({});
  });

  it.each([["limit"], ["=x"], [""]])(
    "returns null for the entry %j",
    (entry) => {
      expect(parseExtraParameters(["ok=1", entry])).toBeNull();
    },
  );

  it("keeps a key named like an object property as plain data", () => {
    const parameters = parseExtraParameters(["__proto__=x"]);

    expect(Object.keys(parameters ?? {})).toEqual(["__proto__"]);
  });
});

describe("proxySignParameters", () => {
  it("defaults the path to the verify route", () => {
    expect(DEFAULT_PROXY_PATH).toBe("/proxy/verify");
  });

  it("builds the verify parameters with the code first", () => {
    const parameters = sign();

    expect(parameters).toEqual({
      code: "IS141909ARS0",
      shop: SHOP,
      logged_in_customer_id: "",
      path_prefix: "/apps/coa",
      timestamp: String(TIMESTAMP),
    });
    expect(Object.keys(parameters ?? {})).toEqual([
      "code",
      "shop",
      "logged_in_customer_id",
      "path_prefix",
      "timestamp",
    ]);
  });

  it("needs no code for the reviews route and adds the extra parameters", () => {
    const parameters = sign({
      path: "/proxy/reviews",
      code: undefined,
      extra: { limit: "5", sort: "rating" },
    });

    expect(parameters).toEqual({
      limit: "5",
      sort: "rating",
      shop: SHOP,
      logged_in_customer_id: "",
      path_prefix: "/apps/coa",
      timestamp: String(TIMESTAMP),
    });
    expect(parameters).not.toHaveProperty("code");
  });

  it("ignores a positional code on a route that does not use one", () => {
    expect(sign({ path: "/proxy/reviews" })).not.toHaveProperty("code");
  });

  it("adds extra parameters to the verify route after the code", () => {
    expect(Object.keys(sign({ extra: { debug: "1" } }) ?? {})).toEqual([
      "code",
      "debug",
      "shop",
      "logged_in_customer_id",
      "path_prefix",
      "timestamp",
    ]);
  });

  it.each([[undefined], [""]])(
    "returns null for the verify route when the code is %j",
    (code) => {
      expect(sign({ code })).toBeNull();
    },
  );

  it.each([
    "shop",
    "logged_in_customer_id",
    "path_prefix",
    "timestamp",
    "signature",
  ])("returns null when an extra parameter is named %s", (reserved) => {
    expect(
      sign({ path: "/proxy/reviews", extra: { [reserved]: "x" } }),
    ).toBeNull();
  });

  it("returns null when an extra parameter is named code on the verify route", () => {
    expect(sign({ extra: { code: "OTHER" } })).toBeNull();
  });

  it("accepts an extra parameter named code on another route", () => {
    expect(
      sign({ path: "/proxy/reviews", extra: { code: "OTHER" } }),
    ).toMatchObject({ code: "OTHER" });
  });
});
