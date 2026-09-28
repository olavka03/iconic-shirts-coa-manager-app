import { describe, expect, it } from "vitest";
import { codeError } from "~/features/codes/utils/code.utils";
import { composeLegacyText } from "~/features/signers/utils/signer-text.utils";
import type { SigningDate } from "~/shared/utils/signing-date.utils";
import fixture from "../../tests/fixtures/legacy-certificates.fixture.json";
import { applyOverrides } from "./legacy-overrides.utils";
import type { ParsedLegacy } from "./legacy-import.types";
import { parseLegacyRecord } from "./legacy-record.utils";

const NOW = new Date("2026-09-26T12:00:00Z");
const records = fixture as Record<string, unknown>[];
const parsed = records.map((record) => parseLegacyRecord(record, { now: NOW }));
const importable = parsed.filter(
  (certificate, index) =>
    certificate.code !== "" &&
    codeError(certificate.code) === null &&
    parsed.findIndex((other) => other.code === certificate.code) === index,
);
const LONDON = "London, United Kingdom";

const signerDate = (date: SigningDate | null) =>
  date ? date.iso + (date.precision === "MONTH" ? "~" : "") : null;

const rows = (code: string) => {
  const certificate = importable.find((candidate) => candidate.code === code);

  if (!certificate) {
    throw new Error(`missing ${code}`);
  }

  return certificate.signers.map((signer) => [
    signer.name,
    signerDate(signer.date),
    signer.location,
  ]);
};

describe("signer strategies (§9.4 golden rows)", () => {
  it("b1: IS141909ARS0 — 14 signers, longest date suffix, grouped names, the Kolo Toure override", () => {
    expect(rows("IS141909ARS0")).toEqual([
      ["Thierry Henry", "2019-11-28", LONDON],
      ["Patrick Vieira", "2019-10-24", LONDON],
      ["Dennis Bergkamp", "2019-09-06", LONDON],
      ["Robert Pires", "2020-07-29", LONDON],
      ["Sol Campbell", "2020-07-23", LONDON],
      ["Ray Parlour", "2020-07-23", LONDON],
      ["Jens Lehmann", "2020-08-27", LONDON],
      ["Pat Rice", "2020-08-30", LONDON],
      ["Freddie Ljungberg", "2021-06-10", LONDON],
      ["Kolo Toure", "2022-03-04", LONDON],
      ["Gilberto Silva", "2022-09-12", LONDON],
      ["Lauren", "2023-01-27", LONDON],
      ["Martin Keown", "2023-10-20", LONDON],
      ["Jeremie Aliadiere", "2023-12-06", LONDON],
    ]);
  });

  it("c: IS141909LIV2005 — 15 triplets", () => {
    const triplets = rows("IS141909LIV2005");
    expect(triplets).toHaveLength(15);
    expect(triplets[0]).toEqual(["Djimi Traoré", "2024-08-07", "Beausoleil"]);
    expect(triplets[1]).toEqual(["Jerzy Dudek", "2024-08-11", "Kraków"]);
    expect(triplets[14]).toEqual(["Rafa Benítez", "2024-11-07", "Liverpool"]);
  });

  it("d: MUGG (comma lists) and RM23 (dash lists with US dates)", () => {
    expect(rows("IS141854MUGG")).toEqual([
      ["Alex Stepney", "2024-03-03", "Manchester"],
      ["Peter Schmeichel", "2024-05-15", "Manchester"],
      ["Edwin Van der Sar", "2024-03-01", "Amsterdam"],
    ]);
    expect(rows("IS141460RM23")).toEqual([
      ["Zinedine Zidane", "2024-05-03", "Miami"],
      ["Ronaldo Nazário", "2024-06-19", "Cannes"],
      ["Roberto Carlos", "2025-07-23", "Madrid"],
      ["Raúl", "2025-09-17", "Madrid"],
    ]);
  });

  it("b2: value (Who) segments", () => {
    expect(rows("IS141892THDBA")).toEqual([
      ["Thierry Henry", "2025-03-03", LONDON],
      ["Dennis Bergkamp", "2024-10-29", LONDON],
    ]);
    expect(rows("IS141434THDBA")).toEqual([
      ["Dennis Bergkamp", "2025-10-29", LONDON],
      ["Thierry Henry", "2025-03-03", LONDON],
    ]);
    expect(rows("IS141304CFLJT")).toEqual([
      ["Frank Lampard", "2021-08-26", LONDON],
      ["John Terry", "2023-05-18", LONDON],
    ]);
    expect(rows("IS141595MBRGN")).toEqual([
      ["Marco van Basten", "2023-11-21", "Utrecht, Netherlands"],
      ["Ruud Gullit", "2023-10-19", LONDON],
    ]);
  });

  it("a: shared date and location, names verbatim", () => {
    const atleticoTeam = rows("IS141088AMT2425");
    expect(atleticoTeam).toHaveLength(23);
    expect(
      atleticoTeam.every(
        ([, date, location]) =>
          date === "2025-09-29" && location === "Madrid, Spain",
      ),
    ).toBe(true);
    expect(atleticoTeam.map(([name]) => name)).toContain(
      "Giovanni Simeone (Giuliano)",
    );
    expect(atleticoTeam[22][0]).toBe("Diego Simeone (manager)");

    const spainMultiSigned = rows("IS141595SPMS");
    expect([
      spainMultiSigned.length,
      spainMultiSigned[0][0],
      spainMultiSigned[9][0],
      spainMultiSigned[0][1],
      spainMultiSigned[0][2],
    ]).toEqual([
      10,
      "Álvaro Morata",
      "Ferran Torres",
      "2025-05-31",
      "Madrid, Spain",
    ]);
    expect(
      rows("IS141111RMTS").every(
        ([, date, location]) =>
          date === "2024-11-26" &&
          location === "Real Madrid Training Center and Bernabeu",
      ),
    ).toBe(true);
    expect(rows("IS141867PSRG9800")).toEqual([
      ["Paul Scholes", "2026-07-06", "Manchester, United Kingdom"],
      ["Ryan Giggs", "2026-07-06", "Manchester, United Kingdom"],
    ]);
    expect(rows("IS141464BMS")).toEqual([
      ["Bayern Munich squad 2025/2026", null, "Munich, Germany"],
    ]);
    expect(rows("IS141060-TKRM")).toEqual([
      ["Toni Kroos", "2025-10-25", "Carabanchel (Madrid), Spain"],
    ]);
    expect(rows("IS141887DDC00")).toEqual([
      ["Didier Drogba", "2026-04~", "Abidjan, Ivory Coast"],
    ]);
  });
});

describe("invariants over the fixture", () => {
  const signers = importable.flatMap((certificate) => certificate.signers);

  it("counts (§9.7 totals)", () => {
    expect(importable).toHaveLength(371);
    expect(signers).toHaveLength(468);
    expect(
      importable.filter((certificate) => certificate.signers.length > 1),
    ).toHaveLength(20);
    expect(
      signers.filter((signer) => signer.date?.precision === "MONTH"),
    ).toHaveLength(10);
    expect(signers.filter((signer) => signer.date === null)).toHaveLength(1);

    const patterns: Record<string, number> = {};

    for (const certificate of importable) {
      patterns[certificate.pattern] = (patterns[certificate.pattern] ?? 0) + 1;
    }

    expect(patterns).toEqual({ a: 355, b1: 1, b2: 5, c: 1, d: 9 });
  });

  it("names are clean", () => {
    expect(
      importable.every((certificate) => certificate.signers.length >= 1),
    ).toBe(true);

    const bad = signers.filter(
      (signer) =>
        signer.name !== "Bayern Munich squad 2025/2026" &&
        (!signer.name || /,| & | and | - |\d/.test(signer.name)),
    );
    expect(bad).toEqual([]);
  });

  it("reports exactly the §9.7 parser issues at their indexes", () => {
    const byCode: Record<string, number[]> = {};
    parsed.forEach((certificate, index) =>
      certificate.issues.forEach((issue) =>
        (byCode[issue.code] ??= []).push(index),
      ),
    );
    expect(byCode).toEqual({
      OVERRIDE_APPLIED: [0, 171, 255],
      NOTE: [248],
      ITEM_MISSING: [67, 130],
      LOCATION_IS_ITEM: [87, 102, 138],
      PHOTO_NOT_URL: [88, 140],
      VIDEO_IS_IMAGE: [113],
      PHOTO_NOT_SHOPIFY_CDN: [374],
    });
  });

  it("round-trips through the composed text with overrides disabled (§7.3)", () => {
    const failures = importable.filter((certificate: ParsedLegacy) => {
      const composed = composeLegacyText(certificate.signers);
      const back = parseLegacyRecord(
        {
          certificate_verification: certificate.code,
          signed: composed.signed,
          date: composed.date,
          location: composed.location,
        },
        { overrides: false, now: NOW },
      );

      return (
        JSON.stringify(back.signers) !== JSON.stringify(certificate.signers)
      );
    });
    expect(failures.map((certificate) => certificate.code)).toEqual([]);
  });

  // Two-space indent and a final newline are what Prettier writes, so formatting the repo leaves
  // the snapshot unchanged.
  it("matches the stored snapshot", async () => {
    const snapshot = importable.map((certificate) => ({
      code: certificate.code,
      item: certificate.item,
      pattern: certificate.pattern,
      signers: certificate.signers,
    }));

    await expect(`${JSON.stringify(snapshot, null, 2)}\n`).toMatchFileSnapshot(
      "__snapshots__/legacy-record.snap.json",
    );
  });
});

describe("overrides", () => {
  it("a stale override fails loudly", () => {
    expect(() =>
      applyOverrides({
        certificate_verification: "IS141909ARS0",
        signed: "no Kolo here",
      }),
    ).toThrow(/Stale legacy override/);
  });

  it("inserts the replacement literally and leaves its input unchanged", () => {
    const original = {
      certificate_verification: "IS100001TEST",
      date: "30 July 20225",
    };
    const { record } = applyOverrides(original, [
      {
        match: { certificate_verification: "IS100001TEST" },
        replace: [{ field: "date", from: "20225", to: "$&" }],
      },
    ]);

    expect(record.date).toBe("30 July $&");
    expect(original).toEqual({
      certificate_verification: "IS100001TEST",
      date: "30 July 20225",
    });
  });

  it("without overrides the year-less date is an error", () => {
    expect(
      parseLegacyRecord(records[0], { overrides: false, now: NOW }).issues.map(
        (issue) => issue.code,
      ),
    ).toEqual(["MISSING_YEAR"]);
  });
});

describe("issues the fixture never raises", () => {
  const parse = (fields: Record<string, unknown>) =>
    parseLegacyRecord(
      { certificate_verification: "AB1234", shirt: "Home shirt", ...fields },
      { now: NOW },
    );
  const codes = (certificate: ParsedLegacy) =>
    certificate.issues.map((issue) => issue.code);

  it("keeps the signer when the shared date can't be read", () => {
    const certificate = parse({
      signed: "Thierry Henry",
      date: "sometime",
      location: LONDON,
    });
    expect(codes(certificate)).toEqual(["DATE_UNPARSED"]);
    expect(certificate.signers).toEqual([
      { name: "Thierry Henry", date: null, location: LONDON },
    ]);
  });

  it("drops a video that isn't a link", () => {
    const certificate = parse({ signed: "Thierry Henry", video: "clip.mp4" });
    expect([certificate.videoUrl, codes(certificate)]).toEqual([
      null,
      ["VIDEO_NOT_URL"],
    ]);
  });

  it("reports a record without signers", () => {
    expect(codes(parse({ signed: " " }))).toEqual(["SIGNERS_UNPARSED"]);
  });

  it("d: warns when the list names someone else", () => {
    const certificate = parse({
      signed: "Alex Stepney",
      "location and date": "Peter Schmeichel in Manchester on 15 May 2024",
    });
    expect([certificate.pattern, codes(certificate)]).toEqual([
      "d",
      ["NAMES_DIFFER"],
    ]);
  });

  it("d: a list that doesn't fit falls through without leftover issues", () => {
    const certificate = parse({
      signed: "Alex Stepney",
      "location and date": "Alex Stepney in Manchester on someday - no pattern",
    });
    expect([certificate.pattern, codes(certificate)]).toEqual(["a", []]);
  });

  it("b2: an unknown Who is an error and that date stays empty", () => {
    const certificate = parse({
      signed: "Thierry Henry and Dennis Bergkamp",
      date: "3 March 2025 (Thierry Henry); 29 October 2024 (Robert Pires)",
      location: LONDON,
    });
    expect([certificate.pattern, codes(certificate)]).toEqual([
      "b2",
      ["UNMATCHED_SIGNER"],
    ]);
    expect(certificate.signers.map((signer) => signer.date)).toEqual([
      { precision: "DAY", iso: "2025-03-03" },
      null,
    ]);
  });
});
