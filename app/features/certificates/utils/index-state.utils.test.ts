import { describe, expect, it } from "vitest";
import { DEFAULT_LIST_PARAMS, type ListParams } from "./list-params.utils";
import {
  CLEAR_ALL,
  chipsFor,
  dateRangeError,
  nextParams,
  noResultsAction,
  pageHref,
  resultCount,
} from "./index-state.utils";

const onPage3: ListParams = { ...DEFAULT_LIST_PARAMS, page: 3 };

describe("nextParams", () => {
  it.each<[string, Partial<ListParams>]>([
    ["a filter", { photo: "yes" }],
    ["a date", { signedFrom: "2025-03-01" }],
    ["the sort", { sort: "updated" }],
    ["the direction", { direction: "asc" }],
    ["the view", { view: "grid" }],
    ["the search", { query: "maldini" }],
  ])("resets the page when %s changes", (_description, patch) => {
    expect(nextParams(onPage3, patch).page).toBe(1);
  });

  it("keeps the requested page", () => {
    expect(nextParams(onPage3, { page: 4 })).toEqual({
      ...DEFAULT_LIST_PARAMS,
      page: 4,
    });
  });

  it("gives a new sort key its natural direction", () => {
    expect(nextParams(DEFAULT_LIST_PARAMS, { sort: "code" }).direction).toBe(
      "asc",
    );
    expect(
      nextParams(
        { ...DEFAULT_LIST_PARAMS, sort: "code", direction: "asc" },
        { sort: "signed" },
      ).direction,
    ).toBe("desc");
  });

  it("keeps the direction when the sort key stays the same", () => {
    const oldestFirst: ListParams = {
      ...DEFAULT_LIST_PARAMS,
      direction: "asc",
    };

    expect(nextParams(oldestFirst, { sort: "created" }).direction).toBe("asc");
    expect(nextParams(oldestFirst, { photo: "no" }).direction).toBe("asc");
  });

  it("goes back to the first page when the page size changes", () => {
    expect(
      nextParams({ ...DEFAULT_LIST_PARAMS, page: 4 }, { perPage: 100 }),
    ).toEqual({ ...DEFAULT_LIST_PARAMS, perPage: 100, page: 1 });
  });

  it("uses an explicit direction over the natural one", () => {
    expect(
      nextParams(DEFAULT_LIST_PARAMS, { sort: "code", direction: "desc" })
        .direction,
    ).toBe("desc");
  });

  it("clears search and filters but keeps sort and view", () => {
    const busy: ListParams = {
      query: "henry",
      photo: "yes",
      video: "no",
      signedFrom: "2025-03-01",
      signedTo: "2025-03-31",
      sort: "code",
      direction: "desc",
      view: "grid",
      page: 2,
      perPage: 50,
    };

    expect(nextParams(busy, CLEAR_ALL)).toEqual({
      ...DEFAULT_LIST_PARAMS,
      sort: "code",
      direction: "desc",
      view: "grid",
      perPage: 50,
    });
  });
});

describe("chipsFor", () => {
  it("has no chips without filters", () => {
    expect(chipsFor({ ...DEFAULT_LIST_PARAMS, query: "henry" })).toEqual([]);
  });

  it("labels the photo and video filters", () => {
    expect(
      chipsFor({ ...DEFAULT_LIST_PARAMS, photo: "yes", video: "no" }),
    ).toEqual([
      {
        key: "photo",
        label: "Has photo",
        remove: { photo: null },
        accessibilityLabel: "Remove photo filter",
      },
      {
        key: "video",
        label: "No video",
        remove: { video: null },
        accessibilityLabel: "Remove video filter",
      },
    ]);
    expect(chipsFor({ ...DEFAULT_LIST_PARAMS, photo: "no" })[0].label).toBe(
      "No photo",
    );
    expect(chipsFor({ ...DEFAULT_LIST_PARAMS, video: "yes" })[0].label).toBe(
      "Has video",
    );
  });

  it.each<[Partial<ListParams>, string]>([
    [
      { signedFrom: "2025-03-01", signedTo: "2025-03-31" },
      "Date signed: 1 Mar 2025–31 Mar 2025",
    ],
    [{ signedFrom: "2025-03-01" }, "Date signed: from 1 Mar 2025"],
    [{ signedTo: "2025-03-31" }, "Date signed: until 31 Mar 2025"],
  ])("labels the date range %o", (dates, label) => {
    expect(chipsFor({ ...DEFAULT_LIST_PARAMS, ...dates })).toEqual([
      {
        key: "signed",
        label,
        remove: { signedFrom: null, signedTo: null },
        accessibilityLabel: "Remove date signed filter",
      },
    ]);
  });
});

describe("resultCount", () => {
  it("counts certificates", () => {
    expect(resultCount(0)).toBe("0 certificates");
    expect(resultCount(1)).toBe("1 certificate");
    expect(resultCount(48)).toBe("48 certificates");
  });
  it("separates thousands", () => {
    expect(resultCount(1234)).toBe("1,234 certificates");
  });
});

describe("noResultsAction", () => {
  it("clears the search when only a search is set", () => {
    expect(noResultsAction({ ...DEFAULT_LIST_PARAMS, query: "zzz" })).toEqual({
      label: "Clear search",
      patch: { query: "" },
    });
  });

  it("clears the filters when only filters are set", () => {
    expect(noResultsAction({ ...DEFAULT_LIST_PARAMS, video: "yes" })).toEqual({
      label: "Clear filters",
      patch: { photo: null, video: null, signedFrom: null, signedTo: null },
    });
  });

  it("clears both when a search and filters are set", () => {
    expect(
      noResultsAction({
        ...DEFAULT_LIST_PARAMS,
        query: "zzz",
        signedTo: "2025-03-31",
      }),
    ).toEqual({ label: "Clear search and filters", patch: CLEAR_ALL });
  });
});

describe("dateRangeError", () => {
  it("rejects an end date before the start date", () => {
    expect(dateRangeError("2025-03-10", "2025-03-01")).toBe(
      "End date can't be before the start date.",
    );
  });

  it.each([
    ["2025-03-01", "2025-03-01"],
    ["2025-03-01", "2025-03-31"],
    ["", "2025-03-01"],
    ["2025-03-01", ""],
    ["", ""],
  ])("accepts %s to %s", (from, to) => {
    expect(dateRangeError(from, to)).toBeNull();
  });
});

describe("pageHref", () => {
  it("keeps every other param and sets the page", () => {
    expect(
      pageHref({ ...DEFAULT_LIST_PARAMS, query: "henry", view: "grid" }, 2),
    ).toBe("/app?q=henry&view=grid&page=2");
  });

  it("drops the page param for the first page", () => {
    expect(pageHref({ ...DEFAULT_LIST_PARAMS, view: "grid", page: 2 }, 1)).toBe(
      "/app?view=grid",
    );
    expect(pageHref({ ...DEFAULT_LIST_PARAMS, page: 2 }, 1)).toBe("/app");
  });
});
