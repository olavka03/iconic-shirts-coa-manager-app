import { describe, expect, it } from "vitest";
import {
  MONTHS_LONG,
  MONTHS_SHORT,
  formatDateLong,
  formatDateShort,
  formatIsoDayShort,
  formatOrderTime,
  formatTimestampDay,
  joinWithAnd,
  listSeparator,
  pluralize,
  truncateText,
} from "./format.utils";

describe("month names", () => {
  it("uses fixed English arrays", () => {
    expect(MONTHS_LONG).toHaveLength(12);
    expect(MONTHS_SHORT).toHaveLength(12);
    expect([MONTHS_LONG[0], MONTHS_LONG[11]]).toEqual(["January", "December"]);
    expect(MONTHS_SHORT[8]).toBe("Sep");
  });
});

describe("signing dates", () => {
  it("formats the customer-facing long form", () => {
    expect(formatDateLong({ precision: "DAY", iso: "2022-03-04" })).toBe(
      "4 March 2022",
    );
    expect(formatDateLong({ precision: "MONTH", iso: "2026-04" })).toBe(
      "April 2026",
    );
  });
  it("formats the admin short form, never Sept", () => {
    expect(formatDateShort({ precision: "DAY", iso: "2026-09-26" })).toBe(
      "26 Sep 2026",
    );
    expect(formatDateShort({ precision: "MONTH", iso: "2026-04" })).toBe(
      "Apr 2026",
    );
    expect(formatIsoDayShort("2025-03-01")).toBe("1 Mar 2025");
  });
});

describe("timestamps in the shop's time zone", () => {
  it("formats order times", () => {
    expect(formatOrderTime("2026-09-26T18:14:37Z", "Europe/London")).toBe(
      "26 Sep 2026 at 19:14",
    );
    expect(formatOrderTime("2026-09-26T18:14:37Z", "America/New_York")).toBe(
      "26 Sep 2026 at 14:14",
    );
  });
  it("writes midnight as 00, never 24", () => {
    expect(formatOrderTime("2026-09-26T23:05:00Z", "Europe/London")).toBe(
      "27 Sep 2026 at 00:05",
    );
  });
  it("falls back to UTC for an unknown zone", () => {
    expect(formatOrderTime("2026-09-26T18:14:37Z", "Mars/Olympus")).toBe(
      "26 Sep 2026 at 18:14",
    );
    expect(formatTimestampDay("2026-03-12T23:30:00Z", "Mars/Olympus")).toBe(
      "12 Mar 2026",
    );
  });
  it("formats the day of a timestamp", () => {
    expect(formatTimestampDay("2026-03-12T23:30:00Z", "Europe/London")).toBe(
      "12 Mar 2026",
    );
    expect(formatTimestampDay("2026-03-12T23:30:00Z", "Asia/Tokyo")).toBe(
      "13 Mar 2026",
    );
  });
});

describe("truncateText", () => {
  it("cuts at a word boundary near the limit", () => {
    expect(
      truncateText(
        "Robert Lewandowski Signed Original Bayern Munich Football Shirt - 2015-16 Home",
        60,
      ),
    ).toBe("Robert Lewandowski Signed Original Bayern Munich Football…");
  });
  it("cuts mid-word when no boundary is close", () => {
    const cut = truncateText("A".repeat(70), 60);
    expect(cut).toHaveLength(61);
    expect(cut.endsWith("…")).toBe(true);
  });
  it("cuts mid-word when the only space is too far back", () => {
    const cut = truncateText("ab " + "c".repeat(70), 60);
    expect(cut).toHaveLength(61);
    expect(cut).toBe("ab " + "c".repeat(57) + "…");
  });
  it("cuts at a space at maxLength - 15, but not one character earlier", () => {
    expect(truncateText("a".repeat(45) + " " + "b".repeat(30), 60)).toBe(
      "a".repeat(45) + "…",
    );
    expect(truncateText("a".repeat(44) + " " + "b".repeat(30), 60)).toBe(
      "a".repeat(44) + " " + "b".repeat(15) + "…",
    );
  });
  it("leaves short text alone", () => {
    expect(truncateText("short", 60)).toBe("short");
    expect(truncateText("B".repeat(60), 60)).toBe("B".repeat(60));
  });
});

describe("pluralize", () => {
  it("adds an s unless the count is one", () => {
    expect(pluralize(0, "order")).toBe("0 orders");
    expect(pluralize(1, "order")).toBe("1 order");
    expect(pluralize(2, "other code")).toBe("2 other codes");
  });
  it("separates thousands", () => {
    expect(pluralize(1234, "certificate")).toBe("1,234 certificates");
  });
});

describe("listSeparator and joinWithAnd", () => {
  it("puts nothing before the first part", () => {
    expect(listSeparator(0, 1)).toBe("");
    expect(listSeparator(0, 3)).toBe("");
  });
  it("joins two parts with and", () => {
    expect(listSeparator(1, 2)).toBe(" and ");
    expect(joinWithAnd(["Item", "Product"])).toBe("Item and Product");
  });
  it("uses an Oxford comma for three or more", () => {
    expect(listSeparator(1, 3)).toBe(", ");
    expect(listSeparator(2, 3)).toBe(", and ");
    expect(joinWithAnd(["A", "B", "C", "D"])).toBe("A, B, C, and D");
  });
  it("leaves one part alone and gives nothing for none", () => {
    expect(joinWithAnd(["Item"])).toBe("Item");
    expect(joinWithAnd([])).toBe("");
  });
});
