import { describe, expect, it } from "vitest";
import { parseReviewsQuery } from "./reviews-query.utils";

const DEFAULT_QUERY = {
  limit: 50,
  page: 1,
  sort: "date",
  order: "desc",
  productId: null,
  productHandle: null,
  rating: null,
  minRating: null,
  hasText: false,
};
const PARAMETER_NAMES = [
  "limit",
  "page",
  "sort",
  "order",
  "product_id",
  "product_handle",
  "rating",
  "min_rating",
  "has_text",
];
const SHOPIFY_PARAMETERS = {
  shop: "example.myshopify.com",
  logged_in_customer_id: "",
  path_prefix: "/apps/coa",
  timestamp: "1761850000",
  signature: "0123456789abcdef",
};

function parse(init: string | Record<string, string>) {
  return parseReviewsQuery(new URLSearchParams(init));
}

function accepted(overrides: Record<string, unknown>) {
  return { ok: true, query: { ...DEFAULT_QUERY, ...overrides } };
}

function rejected(parameter: string) {
  return { ok: false, parameter };
}

describe("parseReviewsQuery", () => {
  describe("defaults and ignored input", () => {
    it("returns the defaults for empty params", () => {
      expect(parse("")).toStrictEqual(accepted({}));
    });

    it("treats blank values as absent", () => {
      expect(parse("limit=&product_id=&sort=")).toStrictEqual(accepted({}));
    });

    it("ignores unknown parameters and the five Shopify ones", () => {
      expect(
        parse({ ...SHOPIFY_PARAMETERS, cache_buster: "abc", limit: "7" }),
      ).toStrictEqual(accepted({ limit: 7 }));
    });

    it("rejects a repeated parameter", () => {
      expect(parse("limit=5&limit=6")).toStrictEqual(rejected("limit"));
    });

    it("rejects a repeated parameter even when one value is blank", () => {
      expect(parse("sort=&sort=date")).toStrictEqual(rejected("sort"));
    });
  });

  describe("limit and page", () => {
    it.each([
      ["0", 1],
      ["500", 100],
      ["-3", 1],
      ["100", 100],
      ["101", 100],
      ["7", 7],
      ["007", 7],
      ["123456789", 100],
    ])("limit=%s becomes %i", (value, expected) => {
      expect(parse({ limit: value })).toStrictEqual(
        accepted({ limit: expected }),
      );
    });

    it.each(["abc", "1.5", "1234567890", "+5", " 5", "5 ", "1e2", "--1"])(
      "limit=%j is invalid",
      (value) => {
        expect(parse({ limit: value })).toStrictEqual(rejected("limit"));
      },
    );

    it.each([
      ["0", 1],
      ["-4", 1],
      ["1", 1],
      ["3", 3],
      ["999999999", 999999999],
    ])("page=%s becomes %i", (value, expected) => {
      expect(parse({ page: value })).toStrictEqual(
        accepted({ page: expected }),
      );
    });

    it.each(["abc", "2.5", "1234567890"])("page=%j is invalid", (value) => {
      expect(parse({ page: value })).toStrictEqual(rejected("page"));
    });
  });

  describe("rating and min_rating", () => {
    it.each([
      ["rating", "rating"],
      ["min_rating", "minRating"],
    ])("%s accepts 1 to 5", (parameter, field) => {
      for (const value of [1, 2, 3, 4, 5]) {
        expect(parse({ [parameter]: String(value) })).toStrictEqual(
          accepted({ [field]: value }),
        );
      }
    });

    it.each(["rating", "min_rating"])(
      "%s rejects out of range and non-numeric values",
      (parameter) => {
        for (const value of ["0", "6", "x", "10", "-1", "1.5", " 3", "3\n"]) {
          expect(parse({ [parameter]: value })).toStrictEqual(
            rejected(parameter),
          );
        }
      },
    );

    it("accepts both together", () => {
      expect(parse("rating=4&min_rating=2")).toStrictEqual(
        accepted({ rating: 4, minRating: 2 }),
      );
    });
  });

  describe("sort, order and has_text", () => {
    it("accepts the documented values", () => {
      expect(parse("sort=rating&order=asc")).toStrictEqual(
        accepted({ sort: "rating", order: "asc" }),
      );
      expect(parse("sort=date&order=desc")).toStrictEqual(accepted({}));
    });

    it("trims before matching", () => {
      expect(
        parse({ sort: " rating ", order: " asc ", has_text: " 1 " }),
      ).toStrictEqual(
        accepted({ sort: "rating", order: "asc", hasText: true }),
      );
    });

    it.each([
      ["sort", "Date"],
      ["sort", "price"],
      ["order", "ASC"],
      ["order", "descending"],
      ["has_text", "yes"],
      ["has_text", "TRUE"],
      ["has_text", "2"],
    ])("%s=%s is invalid", (parameter, value) => {
      expect(parse({ [parameter]: value })).toStrictEqual(rejected(parameter));
    });

    it.each([
      ["1", true],
      ["true", true],
      ["0", false],
      ["false", false],
    ])("has_text=%s becomes %s", (value, expected) => {
      expect(parse({ has_text: value })).toStrictEqual(
        accepted({ hasText: expected }),
      );
    });

    it("treats a whitespace-only sort as invalid, not absent", () => {
      expect(parse("sort=%20")).toStrictEqual(rejected("sort"));
    });

    it("does not read inherited object keys as values", () => {
      expect(parse({ has_text: "constructor" })).toStrictEqual(
        rejected("has_text"),
      );
      expect(parse({ sort: "__proto__" })).toStrictEqual(rejected("sort"));
    });
  });

  describe("product_id", () => {
    it("accepts a Shopify id as a number", () => {
      expect(parse({ product_id: "1234567890123" })).toStrictEqual(
        accepted({ productId: 1234567890123 }),
      );
    });

    it("accepts the largest safe integer and rejects the next one", () => {
      expect(parse({ product_id: "9007199254740991" })).toStrictEqual(
        accepted({ productId: 9007199254740991 }),
      );
      expect(parse({ product_id: "9007199254740992" })).toStrictEqual(
        rejected("product_id"),
      );
    });

    it.each([
      "0",
      "-5",
      "abc",
      "012",
      "12345678901234567",
      "9999999999999999",
      "1.5",
      " 7",
    ])("product_id=%j is invalid", (value) => {
      expect(parse({ product_id: value })).toStrictEqual(
        rejected("product_id"),
      );
    });
  });

  describe("product_handle", () => {
    it("stores the handle lower-cased", () => {
      expect(parse({ product_handle: "Example-Shirt_2" })).toStrictEqual(
        accepted({ productHandle: "example-shirt_2" }),
      );
    });

    it("accepts an accented handle", () => {
      expect(parse({ product_handle: "Crème-Brûlée-Shirt" })).toStrictEqual(
        accepted({ productHandle: "crème-brûlée-shirt" }),
      );
    });

    it("accepts 255 characters and rejects 256", () => {
      const longest = "a".repeat(255);

      expect(parse({ product_handle: longest })).toStrictEqual(
        accepted({ productHandle: longest }),
      );
      expect(parse({ product_handle: "a".repeat(256) })).toStrictEqual(
        rejected("product_handle"),
      );
    });

    it.each(["a b", "a/b", "a.b", "a%b", "shirt\n", " shirt", "emoji-😀"])(
      "product_handle=%j is invalid",
      (value) => {
        expect(parse({ product_handle: value })).toStrictEqual(
          rejected("product_handle"),
        );
      },
    );

    it("reports product_id when both product parameters are present", () => {
      expect(
        parse({ product_id: "123", product_handle: "example-shirt" }),
      ).toStrictEqual(rejected("product_id"));
    });

    it("reports product_id before judging either value", () => {
      expect(parse({ product_id: "5", product_handle: "bad!" })).toStrictEqual(
        rejected("product_id"),
      );
    });

    it("lets a blank product parameter sit beside the other one", () => {
      expect(
        parse({ product_id: "", product_handle: "example-shirt" }),
      ).toStrictEqual(accepted({ productHandle: "example-shirt" }));
      expect(parse({ product_id: "123", product_handle: "" })).toStrictEqual(
        accepted({ productId: 123 }),
      );
    });
  });

  describe("invalid results", () => {
    const INVALID_INPUTS: [string, string][] = [
      ["limit", "abc"],
      ["page", "abc"],
      ["sort", "Date"],
      ["order", "ASC"],
      ["product_id", "0"],
      ["product_handle", "a b"],
      ["rating", "6"],
      ["min_rating", "0"],
      ["has_text", "yes"],
    ];

    it.each(INVALID_INPUTS)(
      "%s names itself, one of the fixed names",
      (parameter, value) => {
        const result = parse({ [parameter]: value });

        expect(result).toStrictEqual(rejected(parameter));
        expect(PARAMETER_NAMES).toContain(
          (result as { parameter: string }).parameter,
        );
      },
    );

    it.each(PARAMETER_NAMES)(
      "never echoes the submitted value for %s",
      (parameter) => {
        const result = parse({ [parameter]: "SECRET VALUE 4242" });

        expect(result.ok).toBe(false);
        expect(JSON.stringify(result)).not.toContain("SECRET");
        expect(JSON.stringify(result)).not.toContain("4242");
        expect(JSON.stringify(result)).not.toContain("VALUE");
      },
    );

    it("reports the first invalid parameter in table order", () => {
      expect(parse("rating=9&page=abc&limit=zzz")).toStrictEqual(
        rejected("limit"),
      );
      expect(parse("has_text=maybe&rating=9")).toStrictEqual(
        rejected("rating"),
      );
    });
  });
});
