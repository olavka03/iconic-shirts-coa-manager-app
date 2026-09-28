import { describe, expect, it } from "vitest";
import {
  filterRecentOrders,
  normalizeOrderSearch,
  orderNameSymbols,
  orderNumericId,
  orderSearchQuery,
  orderToken,
  rankOrderMatches,
} from "./orders.utils";
import { buildSearchText } from "~/features/certificates/utils/search-text.utils";

describe("orderToken", () => {
  it.each([
    ["#141909", "141909"],
    ["EN1001", "1001"],
    ["1001-A", "1001"],
    ["#141909-UK", "141909"],
    ["#Ünï1", "1"],
    ["#ABC", null],
    ["", null],
    [null, null],
  ])("%j → %j", (name, token) => expect(orderToken(name)).toBe(token));

  it("matches the order token inside the search text", () => {
    for (const name of ["#141909-UK", "1001-A", "EN1001"]) {
      const words = buildSearchText({
        code: "ABCD",
        item: "",
        orderName: name,
        signerNames: [],
      }).split(" ");
      expect(words).toContain(orderToken(name)!.toLowerCase());
    }
  });
});

describe("normalizeOrderSearch", () => {
  it.each([
    ["#141909", "141909"],
    [" # 141909 ", "141909"],
    ["141 909", "141909"],
    ["141909 OR x", "141909ORX"],
    ["-1", "1"],
    ["1001-a", "1001-A"],
    ["1-", null],
    ["-", null],
    ["name:1", null],
    ['"141909"', null],
    ["(141909)", null],
    ["", null],
    ["1".repeat(20), "1".repeat(20)],
    ["1".repeat(21), null],
  ])("%j → %j", (input, term) =>
    expect(normalizeOrderSearch(input)).toBe(term),
  );
});

describe("orderNameSymbols", () => {
  it.each([
    ["#14", "#"],
    ["#", "#"],
    ["EN", ""],
    ["", ""],
  ])("%j → %j", (prefix, symbols) =>
    expect(orderNameSymbols(prefix)).toBe(symbols),
  );
});

describe("orderSearchQuery", () => {
  it("adds the symbol form only for safe symbols", () => {
    expect(orderSearchQuery("141909", "#")).toBe("name:141909 OR name:#141909");
    expect(orderSearchQuery("EN1001", "")).toBe("name:EN1001");
    expect(orderSearchQuery("141909", "#:")).toBe("name:141909");
    expect(orderSearchQuery("141909", "(")).toBe("name:141909");
    expect(orderSearchQuery("141909", "# ")).toBe("name:141909");
    expect(orderSearchQuery(null, "#")).toBeNull();
  });

  it("builds the V4 all-status forms", () => {
    expect(orderSearchQuery(null, "#", { allStatuses: true })).toBe(
      "status:open OR status:closed OR status:cancelled",
    );
    expect(orderSearchQuery("141909", "#", { allStatuses: true })).toBe(
      "(status:open OR status:closed OR status:cancelled) AND (name:141909 OR name:#141909)",
    );
  });

  it("only ever emits name: and status: terms (customer-data guard, spec §12.2)", () => {
    const nasty = [
      "141909 OR customer:x",
      "email:a@b.c",
      "#141909) OR (x",
      "\\",
      "name:1",
      "141909",
      "1001-A",
      "EN1001",
      "'1'",
      " # 14 19 09 ",
    ];
    const allowed = (term: string) =>
      term === "OR" ||
      term === "AND" ||
      /^name:[A-Z0-9#-]+$/.test(term) ||
      /^status:(open|closed|cancelled)$/.test(term);
    const queries = nasty.flatMap((raw) =>
      ["#", "", "#:"].flatMap((symbols) =>
        [false, true].map((allStatuses) =>
          orderSearchQuery(normalizeOrderSearch(raw), symbols, { allStatuses }),
        ),
      ),
    );
    const builtQueries = queries.filter(
      (query): query is string => query !== null,
    );

    expect(builtQueries.length).toBeGreaterThan(0);

    for (const query of builtQueries) {
      const terms = query.replace(/[()]/g, " ").split(/\s+/).filter(Boolean);
      expect(terms.every(allowed)).toBe(true);
    }
  });
});

describe("ranking and filtering", () => {
  const rows = [{ name: "#141909" }, { name: "#1419090" }, { name: "#141900" }];

  it("keeps only exact matches when one exists", () => {
    expect(rankOrderMatches(rows, "141909")).toEqual([{ name: "#141909" }]);
    expect(rankOrderMatches(rows, "14190")).toEqual(rows);
  });

  it("filters recent orders by token prefix", () => {
    expect(filterRecentOrders(rows, "#141909")).toEqual([
      { name: "#141909" },
      { name: "#1419090" },
    ]);
    expect(filterRecentOrders(rows, "14190")).toEqual(rows);
    expect(filterRecentOrders(rows, "")).toEqual(rows);
  });

  it("reads numeric order ids", () => {
    expect(orderNumericId("gid://shopify/Order/18909761437923")).toBe(
      "18909761437923",
    );
    expect(orderNumericId("gid://shopify/LineItem/1")).toBeNull();
  });
});
