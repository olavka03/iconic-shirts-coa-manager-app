import { describe, expect, it } from "vitest";
import {
  isYearlessDate,
  monthNumber,
  parseLegacyDate,
} from "./legacy-dates.utils";

const NOW = new Date("2026-09-26T12:00:00Z");

describe("parseLegacyDate (§9.5)", () => {
  it.each([
    ["2025-9-29", "DAY", "2025-09-29"],
    ["2018-06-16", "DAY", "2018-06-16"],
    ["2025-8-2", "DAY", "2025-08-02"],
    ["15 August 2026", "DAY", "2026-08-15"],
    ["28th November 2019", "DAY", "2019-11-28"],
    ["2 december 2025", "DAY", "2025-12-02"],
    ["2 februari 2026", "DAY", "2026-02-02"],
    ["3 Oktober 2024", "DAY", "2024-10-03"],
    ["12 März 2024", "DAY", "2024-03-12"],
    ["1 mei 2025", "DAY", "2025-05-01"],
    ["June 11, 2023", "DAY", "2023-06-11"],
    ["May 3, 2024", "DAY", "2024-05-03"],
    ["4th of March 2022", "DAY", "2022-03-04"],
    ["April 2026", "MONTH", "2026-04"],
    ["September 2025", "MONTH", "2025-09"],
    ["Sept 2025", "MONTH", "2025-09"],
    ["3 Aug. 2024", "DAY", "2024-08-03"],
    [" 27 September 2025", "DAY", "2025-09-27"],
  ])("%j", (text, precision, iso) =>
    expect(parseLegacyDate(text, NOW)).toEqual({ precision, iso }),
  );

  it.each([
    "31 February 2024",
    "30 July 20225",
    "4th March",
    "2025-13-01",
    "1899-12-31",
    "",
    "2027-01-01",
    "December 2026",
  ])("rejects %j", (text) => expect(parseLegacyDate(text, NOW)).toBeNull());

  it("reads a month name with a trailing period, and nothing else", () => {
    expect(monthNumber("Sept.")).toBe(9);
    expect(monthNumber("xyz")).toBeNull();
  });

  it("recognises year-less day-month text", () => {
    expect(isYearlessDate("4th March")).toBe(true);
    expect(isYearlessDate("Kolo Toure")).toBe(false);
  });
});
