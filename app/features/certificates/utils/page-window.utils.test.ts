import { describe, expect, it } from "vitest";
import { pageWindow, rangeText } from "./page-window.utils";

describe("pageWindow", () => {
  it("shows every page up to seven", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("shows the first five near the start", () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, 4, 5, "gap", 20]);
    expect(pageWindow(4, 20)).toEqual([1, 2, 3, 4, 5, "gap", 20]);
  });

  it("shows the last five near the end", () => {
    expect(pageWindow(17, 20)).toEqual([1, "gap", 16, 17, 18, 19, 20]);
    expect(pageWindow(20, 20)).toEqual([1, "gap", 16, 17, 18, 19, 20]);
  });

  it("shows the current page and its neighbours in the middle", () => {
    expect(pageWindow(5, 20)).toEqual([1, "gap", 4, 5, 6, "gap", 20]);
    expect(pageWindow(16, 20)).toEqual([1, "gap", 15, 16, 17, "gap", 20]);
    expect(pageWindow(5, 8)).toEqual([1, "gap", 4, 5, 6, 7, 8]);
  });
});

describe("rangeText", () => {
  it("counts the rows on the page with en-US separators", () => {
    expect(rangeText(2, 25, 200)).toBe("26–50 of 200");
    expect(rangeText(3, 25, 60)).toBe("51–60 of 60");
    expect(rangeText(41, 25, 1_234)).toBe("1,001–1,025 of 1,234");
    expect(rangeText(1, 25, 0)).toBeNull();
  });
});
