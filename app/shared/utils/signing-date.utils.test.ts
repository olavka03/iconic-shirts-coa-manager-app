import { describe, expect, it } from "vitest";
import {
  fromDbDate,
  isNotFuture,
  isValidDayIso,
  isValidMonthIso,
  sortKey,
  toDbDate,
  todayIsoLocal,
} from "./signing-date.utils";

describe("database dates", () => {
  it("writes UTC midnight, a month on its first day", () => {
    expect(
      toDbDate({ precision: "DAY", iso: "2024-03-01" }).toISOString(),
    ).toBe("2024-03-01T00:00:00.000Z");
    expect(toDbDate({ precision: "MONTH", iso: "2026-04" }).toISOString()).toBe(
      "2026-04-01T00:00:00.000Z",
    );
  });
  it("reads the UTC date, not the local one", () => {
    const stored = new Date("2024-03-01T00:00:00Z");
    // The unit project runs in America/Los_Angeles, where a local read lands on the day before.
    expect(stored.getDate()).toBe(29);
    expect(fromDbDate(stored, "DAY")).toEqual({
      precision: "DAY",
      iso: "2024-03-01",
    });
    expect(fromDbDate(stored, "MONTH")).toEqual({
      precision: "MONTH",
      iso: "2024-03",
    });
  });
  it("sorts a month by its first day", () => {
    expect(sortKey({ precision: "DAY", iso: "2024-03-20" })).toBe("2024-03-20");
    expect(sortKey({ precision: "MONTH", iso: "2024-03" })).toBe("2024-03-01");
  });
});

describe("validation", () => {
  it("accepts real calendar days from 1900", () => {
    expect(isValidDayIso("2024-02-29")).toBe(true);
    expect(isValidDayIso("1900-01-01")).toBe(true);
    expect(
      [
        "2023-02-29",
        "1899-12-31",
        "2024-13-01",
        "2024-1-01",
        "2024-04-31",
        "",
      ].map(isValidDayIso),
    ).toEqual([false, false, false, false, false, false]);
  });
  it("accepts months from 1900", () => {
    expect(isValidMonthIso("2026-04")).toBe(true);
    expect(
      ["2026-13", "1899-12", "2026-00", "2026-4"].map(isValidMonthIso),
    ).toEqual([false, false, false, false]);
  });
  it("allows up to UTC today plus one day, a month from its first day", () => {
    const now = new Date("2026-09-26T23:30:00Z");
    expect(isNotFuture({ precision: "DAY", iso: "2026-09-27" }, now)).toBe(
      true,
    );
    expect(isNotFuture({ precision: "MONTH", iso: "2026-09" }, now)).toBe(true);
    expect(isNotFuture({ precision: "DAY", iso: "2026-09-28" }, now)).toBe(
      false,
    );
    expect(isNotFuture({ precision: "MONTH", iso: "2026-10" }, now)).toBe(
      false,
    );
  });
  it("counts from the UTC day, not the local one", () => {
    // 20:00 on 26 September in Los Angeles, the unit project's time zone.
    const now = new Date("2026-09-27T03:00:00Z");
    expect(isNotFuture({ precision: "DAY", iso: "2026-09-28" }, now)).toBe(
      true,
    );
    expect(isNotFuture({ precision: "DAY", iso: "2026-09-29" }, now)).toBe(
      false,
    );
  });
});

describe("todayIsoLocal", () => {
  it("uses the local calendar day", () => {
    expect(todayIsoLocal(new Date(2026, 8, 26, 23, 30))).toBe("2026-09-26");
    expect(todayIsoLocal(new Date(2026, 0, 5, 0, 1))).toBe("2026-01-05");
  });
});
