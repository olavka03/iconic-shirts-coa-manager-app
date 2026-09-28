import { describe, expect, it } from "vitest";
import {
  composeLegacyText,
  dateSignedLabel,
  joinNames,
  signerSummary,
  type SignerLike,
} from "./signer-text.utils";

const dayDate = (iso: string) => ({ precision: "DAY" as const, iso });
const monthDate = (iso: string) => ({ precision: "MONTH" as const, iso });
const LONDON = "London, United Kingdom";
const signer = (
  name: string,
  date: SignerLike["date"],
  location: string | null,
): SignerLike => ({ name, date, location });

describe("composeLegacyText (spec §7.3)", () => {
  it.each<
    [string, SignerLike[], { signed: string; date: string; location: string }]
  >([
    [
      "PSRG9800",
      [
        signer(
          "Paul Scholes",
          dayDate("2026-07-06"),
          "Manchester, United Kingdom",
        ),
        signer(
          "Ryan Giggs",
          dayDate("2026-07-06"),
          "Manchester, United Kingdom",
        ),
      ],
      {
        signed: "Paul Scholes and Ryan Giggs",
        date: "6 July 2026",
        location: "Manchester, United Kingdom",
      },
    ],
    [
      "THDBA",
      [
        signer("Thierry Henry", dayDate("2025-03-03"), LONDON),
        signer("Dennis Bergkamp", dayDate("2024-10-29"), LONDON),
      ],
      {
        signed: "Thierry Henry and Dennis Bergkamp",
        date: "3 March 2025 (Thierry Henry); 29 October 2024 (Dennis Bergkamp)",
        location: LONDON,
      },
    ],
    [
      "MBRGN",
      [
        signer(
          "Marco van Basten",
          dayDate("2023-11-21"),
          "Utrecht, Netherlands",
        ),
        signer("Ruud Gullit", dayDate("2023-10-19"), LONDON),
      ],
      {
        signed: "Marco van Basten and Ruud Gullit",
        date: "21 November 2023 (Marco van Basten); 19 October 2023 (Ruud Gullit)",
        location:
          "Utrecht, Netherlands (Marco van Basten); London, United Kingdom (Ruud Gullit)",
      },
    ],
    [
      "MUGG",
      [
        signer("Alex Stepney", dayDate("2024-03-03"), "Manchester"),
        signer("Peter Schmeichel", dayDate("2024-05-15"), "Manchester"),
        signer("Edwin Van der Sar", dayDate("2024-03-01"), "Amsterdam"),
      ],
      {
        signed: "Alex Stepney, Peter Schmeichel and Edwin Van der Sar",
        date: "3 March 2024 (Alex Stepney); 15 May 2024 (Peter Schmeichel); 1 March 2024 (Edwin Van der Sar)",
        location:
          "Manchester (Alex Stepney and Peter Schmeichel); Amsterdam (Edwin Van der Sar)",
      },
    ],
    [
      "ARS0 (grouped names)",
      [
        signer("Thierry Henry", dayDate("2019-11-28"), LONDON),
        signer("Sol Campbell", dayDate("2020-07-23"), LONDON),
        signer("Ray Parlour", dayDate("2020-07-23"), LONDON),
      ],
      {
        signed: "Thierry Henry, Sol Campbell and Ray Parlour",
        date: "28 November 2019 (Thierry Henry); 23 July 2020 (Sol Campbell and Ray Parlour)",
        location: LONDON,
      },
    ],
    [
      "DDC00 (month)",
      [signer("Didier Drogba", monthDate("2026-04"), "Abidjan, Ivory Coast")],
      {
        signed: "Didier Drogba",
        date: "April 2026",
        location: "Abidjan, Ivory Coast",
      },
    ],
    [
      "BMS (no date)",
      [signer("Bayern Munich squad 2025/2026", null, "Munich, Germany")],
      {
        signed: "Bayern Munich squad 2025/2026",
        date: "",
        location: "Munich, Germany",
      },
    ],
  ])("%s", (_name, signers, expected) =>
    expect(composeLegacyText(signers)).toEqual(expected),
  );

  it("never merges DAY and MONTH and leaves out signers without a value", () => {
    expect(
      composeLegacyText([
        signer("A", dayDate("2026-04-01"), null),
        signer("B", monthDate("2026-04"), null),
      ]).date,
    ).toBe("1 April 2026 (A); April 2026 (B)");
    expect(
      composeLegacyText([
        signer("A", dayDate("2026-07-06"), "X"),
        signer("B", null, null),
      ]),
    ).toEqual({
      signed: "A and B",
      date: "6 July 2026 (A)",
      location: "X (A)",
    });
  });
});

describe("labels", () => {
  it("joins names in the legacy style", () => {
    expect([
      joinNames([]),
      joinNames(["A"]),
      joinNames(["A", "B"]),
      joinNames(["A", "B", "C"]),
    ]).toEqual(["", "A", "A and B", "A, B and C"]);
  });
  it("summarises signers for the list", () => {
    expect(signerSummary(["Paolo Maldini"])).toBe("Paolo Maldini");
    expect(signerSummary(["Paul Scholes", "Ryan Giggs"])).toBe(
      "Paul Scholes and Ryan Giggs",
    );
    expect(
      signerSummary([
        "Thierry Henry",
        ...Array.from({ length: 13 }, (_unusedValue, index) => `P${index}`),
      ]),
    ).toBe("Thierry Henry and 13 more");
  });
  it("labels the date signed", () => {
    expect(dateSignedLabel([signer("a", dayDate("2025-03-19"), null)])).toBe(
      "19 Mar 2025",
    );
    expect(dateSignedLabel([signer("a", monthDate("2026-04"), null)])).toBe(
      "Apr 2026",
    );
    expect(
      dateSignedLabel([
        signer("a", dayDate("2019-10-02"), null),
        signer("b", dayDate("2022-03-04"), null),
      ]),
    ).toBe("Oct 2019–Mar 2022");
    expect(
      dateSignedLabel([
        signer("a", dayDate("2024-03-02"), null),
        signer("b", dayDate("2024-03-20"), null),
      ]),
    ).toBe("Mar 2024");
    expect(
      dateSignedLabel([
        signer("a", dayDate("2024-03-01"), null),
        signer("b", monthDate("2024-03"), null),
      ]),
    ).toBe("Mar 2024");
    expect(dateSignedLabel([signer("a", null, "X")])).toBe("");
  });
});
