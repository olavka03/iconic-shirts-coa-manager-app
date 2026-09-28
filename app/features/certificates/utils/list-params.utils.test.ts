import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIST_PARAMS,
  LIST_SORTS,
  PER_PAGE_OPTIONS,
  defaultDirection,
  hasActiveFilters,
  parseDay,
  parseDirection,
  parseListParams,
  parsePresence,
  parseSort,
  toSearchParams,
  type ListParams,
} from "./list-params.utils";

const parse = (query: string) => parseListParams(new URLSearchParams(query));

describe("parseListParams", () => {
  it("returns the defaults for empty params", () => {
    expect(DEFAULT_LIST_PARAMS.perPage).toBe(25);
    expect(parse("")).toEqual(DEFAULT_LIST_PARAMS);
  });
  it("reads the page size and falls back to 25 for anything else", () => {
    expect(PER_PAGE_OPTIONS).toEqual([10, 25, 50, 100]);
    expect(parse("perPage=10").perPage).toBe(10);
    expect(parse("perPage=100").perPage).toBe(100);

    for (const invalid of ["", "48", "1000", "-10", "10.0", "abc"]) {
      expect(parse(`perPage=${invalid}`).perPage).toBe(25);
    }
  });
  it("ignores invalid values", () => {
    expect(
      parse(
        "sort=price&dir=up&photo=maybe&view=list&page=-3&signedFrom=2025-02-30",
      ),
    ).toEqual(DEFAULT_LIST_PARAMS);
  });
  it("picks the default direction for the sort", () => {
    expect(parse("sort=code")).toMatchObject({
      sort: "code",
      direction: "asc",
    });
    expect(parse("sort=signed")).toMatchObject({
      sort: "signed",
      direction: "desc",
    });
    expect(parse("sort=code&dir=desc")).toMatchObject({
      sort: "code",
      direction: "desc",
    });
    expect([
      defaultDirection("created"),
      defaultDirection("updated"),
      defaultDirection("code"),
    ]).toEqual(["desc", "desc", "asc"]);
  });
  it("trims the search and cuts it at 100 characters", () => {
    expect(parse("q=%20%20Henry%20").query).toBe("Henry");
    expect(parse(`q=${"x".repeat(150)}`).query).toBe("x".repeat(100));
  });
  it("drops an inverted date range", () => {
    expect(parse("signedFrom=2025-03-31&signedTo=2025-03-01")).toMatchObject({
      signedFrom: null,
      signedTo: null,
    });
    expect(parse("signedFrom=2025-03-01&signedTo=2025-03-01")).toMatchObject({
      signedFrom: "2025-03-01",
      signedTo: "2025-03-01",
    });
    expect(parse("signedTo=2025-03-01")).toMatchObject({
      signedFrom: null,
      signedTo: "2025-03-01",
    });
  });
  it("reads the page", () => {
    expect(parse("page=2").page).toBe(2);
    expect(parse("page=0").page).toBe(1);
    expect(parse("page=1.5").page).toBe(1);
    expect(parse("page=abc").page).toBe(1);
  });
});

describe("the value parsers", () => {
  it("reads a presence filter", () => {
    expect(parsePresence("yes")).toBe("yes");
    expect(parsePresence("no")).toBe("no");
    expect(parsePresence("any")).toBeNull();
    expect(parsePresence("Yes")).toBeNull();
    expect(parsePresence(null)).toBeNull();
    expect(parsePresence(undefined)).toBeNull();
  });
  it("reads a calendar day", () => {
    expect(parseDay("2025-03-01")).toBe("2025-03-01");
    expect(parseDay("2024-02-29")).toBe("2024-02-29");
    expect(parseDay("2025-02-30")).toBeNull();
    expect(parseDay("2025-03")).toBeNull();
    expect(parseDay("")).toBeNull();
    expect(parseDay(null)).toBeNull();
    expect(parseDay(undefined)).toBeNull();
  });
  it("reads a sort in the list order", () => {
    expect(LIST_SORTS).toEqual(["created", "updated", "signed", "code"]);
    expect(LIST_SORTS.map(parseSort)).toEqual([...LIST_SORTS]);
    expect(parseSort("price")).toBeNull();
    expect(parseSort("")).toBeNull();
    expect(parseSort(null)).toBeNull();
    expect(parseSort(undefined)).toBeNull();
  });
  it("reads a sort direction", () => {
    expect(parseDirection("asc")).toBe("asc");
    expect(parseDirection("desc")).toBe("desc");
    expect(parseDirection("up")).toBeNull();
    expect(parseDirection(null)).toBeNull();
    expect(parseDirection(undefined)).toBeNull();
  });
});

describe("toSearchParams", () => {
  it("omits defaults", () => {
    expect(toSearchParams(DEFAULT_LIST_PARAMS).toString()).toBe("");
    expect(
      toSearchParams({ ...DEFAULT_LIST_PARAMS, perPage: 25 }).toString(),
    ).toBe("");
  });
  it.each<[string, ListParams]>([
    [
      "search and filters",
      {
        ...DEFAULT_LIST_PARAMS,
        query: "thierry henry",
        photo: "yes",
        video: "no",
      },
    ],
    [
      "date range",
      {
        ...DEFAULT_LIST_PARAMS,
        signedFrom: "2024-03-01",
        signedTo: "2024-03-31",
        page: 3,
      },
    ],
    [
      "code ascending in grid",
      { ...DEFAULT_LIST_PARAMS, sort: "code", direction: "asc", view: "grid" },
    ],
    [
      "created ascending",
      {
        ...DEFAULT_LIST_PARAMS,
        sort: "created",
        direction: "asc",
        photo: "no",
        page: 12,
      },
    ],
    ["a page size", { ...DEFAULT_LIST_PARAMS, perPage: 100, page: 2 }],
  ])("round-trips %s", (_name, params) => {
    const searchParams = toSearchParams(params);

    expect(searchParams.toString()).not.toBe("");
    expect(parseListParams(searchParams)).toEqual(params);
  });
});

describe("hasActiveFilters", () => {
  it("counts proof and date filters, not the search", () => {
    expect(hasActiveFilters({ ...DEFAULT_LIST_PARAMS, photo: "yes" })).toBe(
      true,
    );
    expect(hasActiveFilters({ ...DEFAULT_LIST_PARAMS, video: "no" })).toBe(
      true,
    );
    expect(
      hasActiveFilters({ ...DEFAULT_LIST_PARAMS, signedFrom: "2024-01-01" }),
    ).toBe(true);
    expect(
      hasActiveFilters({ ...DEFAULT_LIST_PARAMS, signedTo: "2024-01-01" }),
    ).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_LIST_PARAMS, query: "henry" })).toBe(
      false,
    );
    expect(hasActiveFilters(DEFAULT_LIST_PARAMS)).toBe(false);
  });
});
