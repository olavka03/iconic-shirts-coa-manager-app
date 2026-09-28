import { describe, expect, it } from "vitest";
import fixture from "../../tests/fixtures/legacy-certificates.fixture.json";
import type { PlanInput, RunInfo, SourceInfo } from "./legacy-import.types";
import {
  learnModelFromRecords,
  planLegacyImport,
  recordHash,
} from "./legacy-plan.utils";
import {
  buildReport,
  defaultReportPath,
  formatSummary,
} from "./legacy-report.utils";

const NOW = new Date("2026-09-26T12:00:00Z");
const records = fixture as Record<string, unknown>[];
const BASE_INPUT: PlanInput = {
  records,
  existingCodes: new Set(),
  orderModel: learnModelFromRecords(records),
  formatPrefix: "#",
  formatSuffix: "",
  now: NOW,
};
const orderNames = (plan: ReturnType<typeof planLegacyImport>) =>
  plan.imports.map((plannedImport) => plannedImport.write.orderName);
const indexesWithIssue = (
  plan: ReturnType<typeof planLegacyImport>,
  code: string,
) =>
  plan.records
    .filter((record) => record.issues.some((issue) => issue.code === code))
    .map((record) => record.index);
const NOT_BACKFILLED = [
  "AS988123MBN",
  "DBNL040193",
  "DBNL4919F",
  "EXC100612",
  "EXC98102",
  "IS102243EXC",
  "IS126828MBNL88",
  "IS14736DBA",
  "IS196249ASM",
  "IS196253MBM",
  "IS196253SAFM",
  "IS196255RGAM",
  "IS196260WSIM",
  "IS198765RKM",
  "IS7328921MUGG",
  "IS980108WWA",
  "IS982628RGNL88",
  "MVB040188",
];

describe("planLegacyImport (spec §9.2–§9.7)", () => {
  const plan = planLegacyImport(BASE_INPUT);

  it("classifies exactly the §9.7 set, first occurrence wins", () => {
    expect(indexesWithIssue(plan, "EMPTY_CODE")).toEqual([335]);
    expect(indexesWithIssue(plan, "INVALID_CODE")).toEqual([250]);
    expect(indexesWithIssue(plan, "CODE_CONFLICT")).toEqual([356]);
    expect(indexesWithIssue(plan, "DUPLICATE_IDENTICAL")).toEqual([173]);
    expect(indexesWithIssue(plan, "OVERRIDE_APPLIED")).toEqual([0, 171, 255]);
    expect(indexesWithIssue(plan, "NOTE")).toEqual([248]);
    expect(indexesWithIssue(plan, "PHOTO_NOT_URL")).toEqual([88, 140]);
    expect(indexesWithIssue(plan, "VIDEO_IS_IMAGE")).toEqual([113]);
    expect(indexesWithIssue(plan, "ITEM_MISSING")).toEqual([67, 130]);
    expect(indexesWithIssue(plan, "LOCATION_IS_ITEM")).toEqual([87, 102, 138]);
    expect(indexesWithIssue(plan, "PHOTO_NOT_SHOPIFY_CDN")).toEqual([374]);
    expect(
      plan.records
        .filter((record) =>
          record.issues.some((issue) => issue.code === "ORDER_NOT_BACKFILLED"),
        )
        .map((record) => record.code)
        .sort(),
    ).toEqual([...NOT_BACKFILLED].sort());
    const codes = new Set(
      plan.records.flatMap((record) =>
        record.issues.map((issue) => issue.code),
      ),
    );
    expect([...codes].sort()).toEqual([
      "CODE_CONFLICT",
      "DUPLICATE_IDENTICAL",
      "EMPTY_CODE",
      "INVALID_CODE",
      "ITEM_MISSING",
      "LOCATION_IS_ITEM",
      "NOTE",
      "ORDER_NOT_BACKFILLED",
      "OVERRIDE_APPLIED",
      "PHOTO_NOT_SHOPIFY_CDN",
      "PHOTO_NOT_URL",
      "VIDEO_IS_IMAGE",
    ]);
    expect(plan.records.find((record) => record.index === 332)).toMatchObject({
      code: "IS141116PFCB",
      action: "import",
    });
  });

  it("totals", () => {
    expect(plan.summary).toMatchObject({
      records: 375,
      imported: 371,
      skipped: 4,
      signers: 468,
      overridesApplied: 3,
      orderNamesBackfilled: 353,
    });
    expect(
      plan.imports.every(
        (plannedImport) =>
          plannedImport.write.orderId === null &&
          plannedImport.write.lineItemId === null &&
          plannedImport.write.lineItemTitle === null,
      ),
    ).toBe(true);
    expect(
      plan.imports.find(
        (plannedImport) => plannedImport.code === "IS141909ARS0",
      )!.write.orderName,
    ).toBe("#141909");
  });

  it("uses Shopify's prefix and suffix", () => {
    expect(
      orderNames(planLegacyImport({ ...BASE_INPUT, formatPrefix: "#14" })),
    ).toEqual(orderNames(plan));
    const withUkSuffix = planLegacyImport({
      ...BASE_INPUT,
      formatSuffix: "-UK",
    });
    expect(
      withUkSuffix.imports
        .flatMap((plannedImport) =>
          plannedImport.write.orderName ? [plannedImport.write.orderName] : [],
        )
        .every((orderName) => orderName.endsWith("-UK")),
    ).toBe(true);
    const withEnPrefix = planLegacyImport({
      ...BASE_INPUT,
      formatPrefix: "EN",
    });
    expect(withEnPrefix.summary.orderNamesBackfilled).toBe(0);
    expect(
      withEnPrefix.runIssues.filter(
        (issue) => issue.code === "ORDER_PREFIX_UNSUPPORTED",
      ),
    ).toHaveLength(1);
  });

  it("skips codes already in the app and plans only new ones", () => {
    const existingCodes = new Set(
      plan.imports.map((plannedImport) => plannedImport.code),
    );
    const again = planLegacyImport({ ...BASE_INPUT, existingCodes });
    expect(again.imports).toHaveLength(0);
    expect(
      again.records.filter((record) =>
        record.issues.some(
          (issue) =>
            issue.code === "EXISTS_IN_APP" && issue.severity === "info",
        ),
      ),
    ).toHaveLength(371);
    const edited = records.map((record, index) =>
      index === 5 ? { ...record, notes: "edited" } : record,
    );
    const editedRecord = planLegacyImport({
      ...BASE_INPUT,
      records: edited,
      existingCodes,
    }).records[5];
    expect(editedRecord.action).toBe("skip");
    expect(editedRecord.issues.map((issue) => issue.code)).toContain(
      "EXISTS_IN_APP",
    );
    expect("changed" in editedRecord).toBe(false);
    const fresh = {
      certificate_verification: "IS141999ZZ",
      signed: "New Signer",
      shirt: "Arsenal Home Shirt",
      date: "1 September 2026",
      location: "London",
    };
    const withNew = planLegacyImport({
      ...BASE_INPUT,
      records: [fresh, ...records],
      existingCodes,
    });
    expect(withNew.imports.map((plannedImport) => plannedImport.code)).toEqual([
      "IS141999ZZ",
    ]);
  });

  it("turns a schema violation into PARSE_ERROR and never throws", () => {
    const bad = {
      certificate_verification: "IS141998YY",
      signed: "A",
      shirt: "x".repeat(201),
    };
    const parseErrorPlan = planLegacyImport({
      ...BASE_INPUT,
      records: [bad, 42],
    });
    expect(parseErrorPlan.records[0].issues).toContainEqual(
      expect.objectContaining({ code: "PARSE_ERROR", severity: "error" }),
    );
    expect(parseErrorPlan.records[1].issues).toContainEqual(
      expect.objectContaining({ code: "PARSE_ERROR" }),
    );
    expect(parseErrorPlan.imports).toHaveLength(0);
  });

  it("turns a stale override into PARSE_ERROR", () => {
    const alreadyFixed = {
      ...records[0],
      signed: String(records[0].signed).replace(
        "Kolo Toure 4th March,",
        "Kolo Toure 4th March 2022,",
      ),
    };
    const stalePlan = planLegacyImport({
      ...BASE_INPUT,
      records: [alreadyFixed],
    });

    expect(alreadyFixed.signed).toContain("Kolo Toure 4th March 2022,");
    expect(stalePlan.records[0].issues).toEqual([
      expect.objectContaining({
        severity: "error",
        code: "PARSE_ERROR",
        message: expect.stringContaining("Stale legacy override"),
      }),
    ]);
    expect(stalePlan.imports).toEqual([]);
  });

  it("hashes canonical JSON", () => {
    expect(recordHash({ beta: 1, alpha: [2, { delta: 3, gamma: 4 }] })).toBe(
      recordHash({ alpha: [2, { gamma: 4, delta: 3 }], beta: 1 }),
    );
  });
});

describe("import report (spec §9.8)", () => {
  const plan = planLegacyImport(BASE_INPUT);
  const run: RunInfo = {
    mode: "dry-run",
    startedAt: NOW.toISOString(),
    shop: "a.myshopify.com",
    orderNumberFormatPrefix: "#",
    orderNumberFormatSuffix: "",
  };
  const source: SourceInfo = {
    kind: "shop",
    updatedAt: "2026-09-20T10:00:00Z",
    bytes: 123_456,
    records: 375,
  };

  it("has the §9.8 shape, one entry per source record", () => {
    const report = buildReport(plan, run, source);

    expect(Object.keys(report)).toEqual([
      "run",
      "source",
      "summary",
      "records",
    ]);
    expect(report.run).toEqual(run);
    expect(report.source).toEqual(source);
    expect(report.summary).toEqual({
      imported: 371,
      skipped: 4,
      bySeverity: plan.summary.bySeverity,
      signers: 468,
      overridesApplied: 3,
      orderNamesBackfilled: 353,
    });
    expect(report.records).toHaveLength(375);
    expect(report.records[0]).toMatchObject({
      index: 0,
      code: "IS141909ARS0",
      action: "import",
      pattern: "b1",
      orderName: "#141909",
    });
    expect(report.records[0].signers[0]).toEqual({
      name: "Thierry Henry",
      date: "2019-11-28",
      precision: "DAY",
      location: "London, United Kingdom",
    });
    expect(report.records[0].overrides).toHaveLength(1);
  });

  it("lists a conflicting record in full and nothing else raw", () => {
    const report = buildReport(plan, run, source);
    const withRaw = report.records.filter((record) => "raw" in record);

    expect(withRaw.map((record) => record.index)).toEqual([356]);
    expect(withRaw[0].raw).toEqual(records[356]);
  });

  it("carries the run issues", () => {
    const withEnPrefix = buildReport(
      planLegacyImport({ ...BASE_INPUT, formatPrefix: "EN" }),
      { ...run, orderNumberFormatPrefix: "EN" },
      source,
    );

    expect(withEnPrefix.records).toHaveLength(376);
    expect(withEnPrefix.records[375]).toMatchObject({
      index: -1,
      code: "",
      action: "skip",
      issues: [expect.objectContaining({ code: "ORDER_PREFIX_UNSUPPORTED" })],
    });
  });

  it("prints the shop, the order number format, the source, the totals, the codes to import and every issue", () => {
    const text = formatSummary(plan, run, source);
    const lines = text.split("\n");
    const importHeader = lines.indexOf("To import (371):");
    const importLines = lines.slice(
      importHeader + 1,
      importHeader + 1 + plan.imports.length,
    );
    const issueLines = lines.slice(importHeader + 1 + plan.imports.length);
    const issueCount = plan.records.reduce(
      (total, record) => total + record.issues.length,
      0,
    );

    expect(text).toContain("a.myshopify.com");
    expect(text).toContain('prefix "#", suffix ""');
    expect(text).toContain("123456 bytes, 375 records");
    expect(text).toContain("371 to import, 4 skipped, 468 signers");
    expect(text).toContain("353 order names backfilled, 18 not");
    expect(lines[importHeader - 1]).toMatch(/^Issues: /);
    expect(importLines[0]).toBe("  #0 IS141909ARS0");
    expect(importLines).toEqual(
      plan.imports.map(
        (plannedImport) => `  #${plannedImport.index} ${plannedImport.code}`,
      ),
    );
    expect(issueLines).toHaveLength(issueCount);
    expect(issueLines.every((line) => line.startsWith("  #"))).toBe(true);
    expect(issueLines).toContain(
      "  #335 (no code) ERROR EMPTY_CODE The record has no certificate code.",
    );
    expect(
      issueLines.find((line) =>
        line.startsWith("  #356 IS141116PFCB ERROR CODE_CONFLICT"),
      ),
    ).toBeDefined();
  });

  it("prints run issues without a record index", () => {
    const text = formatSummary(
      planLegacyImport({ ...BASE_INPUT, formatPrefix: "EN" }),
      { ...run, orderNumberFormatPrefix: "EN" },
      source,
    );

    expect(text).toMatch(/^ {2}shop WARNING ORDER_PREFIX_UNSUPPORTED /m);
  });

  it("names the default report file after the start time and the mode", () => {
    expect(defaultReportPath("dry-run", NOW)).toBe(
      ".coa-import/2026-09-26T12-00-00.000Z-dry-run.json",
    );
    expect(defaultReportPath("only-new", NOW)).toBe(
      ".coa-import/2026-09-26T12-00-00.000Z-only-new.json",
    );
  });
});
