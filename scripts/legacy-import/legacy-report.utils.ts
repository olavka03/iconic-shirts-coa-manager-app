import type {
  ImportPlan,
  ImportReport,
  Issue,
  PlannedRecord,
  ReportRecord,
  RunInfo,
  SourceInfo,
} from "./legacy-import.types";
import { pluralize } from "~/shared/utils/format.utils";

const MODE_LABELS: Record<RunInfo["mode"], string> = {
  "dry-run": "dry run",
  apply: "apply",
  "only-new": "apply, new codes only",
};
const SOURCE_LABELS: Record<SourceInfo["kind"], string> = {
  shop: "shop metafield",
  file: "file",
};

export function buildReport(
  plan: ImportPlan,
  run: RunInfo,
  source: SourceInfo,
): ImportReport {
  const {
    imported,
    skipped,
    bySeverity,
    signers,
    overridesApplied,
    orderNamesBackfilled,
  } = plan.summary;

  return {
    run,
    source,
    summary: {
      imported,
      skipped,
      bySeverity,
      signers,
      overridesApplied,
      orderNamesBackfilled,
    },
    records: [...plan.records.map(reportRecord), ...runIssueRecords(plan)],
  };
}

export function formatSummary(
  plan: ImportPlan,
  run: RunInfo,
  source: SourceInfo,
): string {
  const { summary } = plan;
  const notBackfilled = summary.imported - summary.orderNamesBackfilled;

  return [
    `Legacy import (${MODE_LABELS[run.mode]})`,
    `Shop: ${run.shop}`,
    `Order number format: prefix "${run.orderNumberFormatPrefix}", suffix "${run.orderNumberFormatSuffix}"`,
    `Source: ${sourceText(source)}`,
    `Totals: ${summary.imported} to import, ${summary.skipped} skipped, ${pluralize(summary.signers, "signer")}, ${pluralize(summary.overridesApplied, "override")} applied, ${pluralize(summary.orderNamesBackfilled, "order name")} backfilled, ${notBackfilled} not`,
    `Issues: ${pluralize(summary.bySeverity.error, "error")}, ${pluralize(summary.bySeverity.warning, "warning")}, ${summary.bySeverity.info} info`,
    `To import (${summary.imported}):`,
    ...plan.imports.map(
      (plannedImport) => `  #${plannedImport.index} ${plannedImport.code}`,
    ),
    ...plan.runIssues.map((issue) => `  shop ${issueText(issue)}`),
    ...plan.records.flatMap((record) =>
      record.issues.map(
        (issue) =>
          `  #${record.index} ${record.code || "(no code)"} ${issueText(issue)}`,
      ),
    ),
  ].join("\n");
}

export function defaultReportPath(mode: RunInfo["mode"], now: Date): string {
  return `.coa-import/${now.toISOString().replace(/:/g, "-")}-${mode}.json`;
}

function reportRecord(record: PlannedRecord): ReportRecord {
  const {
    index,
    code,
    action,
    pattern,
    orderName,
    signers,
    overrides,
    issues,
  } = record;
  // The merchant recreates a conflicting certificate under a new code from its full record (spec §9.7).
  const conflict = issues.some((issue) => issue.code === "CODE_CONFLICT");

  return {
    index,
    code,
    action,
    pattern,
    orderName,
    signers,
    overrides,
    issues,
    ...(conflict ? { raw: record.raw } : {}),
  };
}

function runIssueRecords(plan: ImportPlan): ReportRecord[] {
  if (plan.runIssues.length === 0) {
    return [];
  }

  return [
    {
      index: -1,
      code: "",
      action: "skip",
      pattern: null,
      orderName: null,
      signers: [],
      overrides: [],
      issues: plan.runIssues,
    },
  ];
}

function sourceText(source: SourceInfo): string {
  const updated = source.updatedAt ? `, updated ${source.updatedAt}` : "";

  return `${SOURCE_LABELS[source.kind]}, ${source.bytes} bytes, ${pluralize(source.records, "record")}${updated}`;
}

function issueText(issue: Issue): string {
  return `${issue.severity.toUpperCase()} ${issue.code} ${issue.message}`;
}
