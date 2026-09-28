import { createHash } from "node:crypto";
import { z } from "zod";
import { ImportCertificateInputSchema } from "~/features/certificates/schemas/certificate.schema";
import { codeError, normalizeCode } from "~/features/codes/utils/code.utils";
import { cleanText } from "~/shared/utils/text.utils";
import type {
  PlanContext,
  ImportPlan,
  Issue,
  IssueSeverity,
  ParsedLegacy,
  PlanInput,
  PlannedImport,
  PlannedRecord,
  PlanSummary,
} from "./legacy-import.types";
import {
  isBackfillablePrefix,
  learnOrderNumberModel,
  type OrderNumberModel,
} from "./legacy-order-names.utils";
import { parseLegacyRecord } from "./legacy-record.utils";
import {
  importInput,
  makeIssue,
  orderNameFor,
  schemaIssue,
  toWrite,
} from "./legacy-write.utils";

type SourceRecord = { index: number; raw: unknown; hash: string };
type Outcome = { record: PlannedRecord; planned: PlannedImport | null };
type Blocked = { issue: Issue };
type ParseResult =
  { ok: true; parsed: ParsedLegacy } | { ok: false; issue: Issue };

const LegacyRecordSchema = z.record(z.string(), z.string());

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }

  if (isRecord(value)) {
    const fields = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);

    return `{${fields.join(",")}}`;
  }

  return JSON.stringify(value);
}

export function recordHash(raw: unknown): string {
  return createHash("sha256").update(canonicalJson(raw)).digest("hex");
}

export function learnModelFromRecords(
  records: readonly unknown[],
): OrderNumberModel | null {
  const codes = records
    .map((record) =>
      normalizeCode(
        cleanText(isRecord(record) ? record.certificate_verification : ""),
      ),
    )
    .filter((code) => codeError(code) === null);

  return learnOrderNumberModel(codes);
}

export function planLegacyImport(input: PlanInput): ImportPlan {
  const prefixSupported = isBackfillablePrefix(input.formatPrefix);
  const runIssues = prefixSupported
    ? []
    : [
        makeIssue(
          "warning",
          "ORDER_PREFIX_UNSUPPORTED",
          `The shop's order prefix "${input.formatPrefix}" isn't digits after its symbols, so no order names are backfilled.`,
        ),
      ];
  const context: PlanContext = { input, prefixSupported, firstSeen: new Map() };
  const outcomes = input.records.map((raw, index) =>
    planRecord({ index, raw, hash: recordHash(raw) }, context),
  );
  const records = outcomes.map((outcome) => outcome.record);
  const imports = outcomes.flatMap((outcome) =>
    outcome.planned ? [outcome.planned] : [],
  );

  return {
    records,
    imports,
    runIssues,
    summary: summarize(records, imports, runIssues),
  };
}

function planRecord(source: SourceRecord, context: PlanContext): Outcome {
  const result = parseRaw(source.raw, context.input.now);

  if (!result.ok) {
    return skip(source, null, [result.issue]);
  }

  const { parsed } = result;
  const blocked = blockingIssue(parsed.code, source, context);

  if (blocked) {
    return skip(source, parsed, [...parsed.issues, blocked.issue]);
  }

  if (parsed.issues.some((issue) => issue.severity === "error")) {
    return skip(source, parsed, parsed.issues);
  }

  const checked = ImportCertificateInputSchema.safeParse(importInput(parsed));

  if (!checked.success) {
    return skip(source, parsed, [...parsed.issues, schemaIssue(checked.error)]);
  }

  const backfill = orderNameFor(parsed.code, context);
  const write = toWrite(checked.data, backfill.orderName);
  const issues = [...parsed.issues, ...backfill.issues];

  return {
    record: plannedRecord(source, parsed, issues, {
      action: "import",
      orderName: write.orderName,
    }),
    planned: {
      index: source.index,
      code: parsed.code,
      overrides: parsed.overrides,
      write,
    },
  };
}

function parseRaw(raw: unknown, now: Date | undefined): ParseResult {
  const loose = LegacyRecordSchema.safeParse(raw);

  if (!loose.success) {
    return {
      ok: false,
      issue: makeIssue(
        "error",
        "PARSE_ERROR",
        "The record is not an object of text fields.",
      ),
    };
  }

  try {
    return { ok: true, parsed: parseLegacyRecord(loose.data, { now }) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return { ok: false, issue: makeIssue("error", "PARSE_ERROR", message) };
  }
}

function blockingIssue(
  code: string,
  source: SourceRecord,
  context: PlanContext,
): Blocked | null {
  return (
    codeIssue(code) ??
    claimCode(code, source, context.firstSeen) ??
    existingCodeIssue(code, context.input)
  );
}

function codeIssue(code: string): Blocked | null {
  if (code === "") {
    return {
      issue: makeIssue(
        "error",
        "EMPTY_CODE",
        "The record has no certificate code.",
      ),
    };
  }

  const error = codeError(code);

  return error
    ? { issue: makeIssue("error", "INVALID_CODE", `"${code}": ${error}`) }
    : null;
}

// First occurrence wins, as the storefront page's Array.find does today.
function claimCode(
  code: string,
  source: SourceRecord,
  firstSeen: PlanContext["firstSeen"],
): Blocked | null {
  const first = firstSeen.get(code);

  if (!first) {
    firstSeen.set(code, { index: source.index, hash: source.hash });

    return null;
  }

  return first.hash === source.hash
    ? {
        issue: makeIssue(
          "info",
          "DUPLICATE_IDENTICAL",
          `Identical to record #${first.index}. Ignored.`,
        ),
      }
    : {
        issue: makeIssue(
          "error",
          "CODE_CONFLICT",
          `Record #${first.index} already uses ${code}. Recreate this certificate with a new code.`,
        ),
      };
}

// Info, not a warning: after the first import every legacy code hits it on each --only-new run.
function existingCodeIssue(code: string, input: PlanInput): Blocked | null {
  return input.existingCodes.has(code)
    ? {
        issue: makeIssue(
          "info",
          "EXISTS_IN_APP",
          `${code} already exists in the app. Not imported.`,
        ),
      }
    : null;
}

function skip(
  source: SourceRecord,
  parsed: ParsedLegacy | null,
  issues: Issue[],
): Outcome {
  const record = plannedRecord(source, parsed, issues, {
    action: "skip",
    orderName: null,
  });

  return { record, planned: null };
}

function plannedRecord(
  source: SourceRecord,
  parsed: ParsedLegacy | null,
  issues: Issue[],
  result: Pick<PlannedRecord, "action" | "orderName">,
): PlannedRecord {
  return {
    index: source.index,
    code: parsed?.code ?? "",
    ...result,
    pattern: parsed?.pattern ?? null,
    signers: (parsed?.signers ?? []).map((signer) => ({
      name: signer.name,
      date: signer.date?.iso ?? null,
      precision: signer.date?.precision ?? null,
      location: signer.location,
    })),
    overrides: parsed?.overrides ?? [],
    issues,
    raw: source.raw,
  };
}

function summarize(
  records: PlannedRecord[],
  imports: PlannedImport[],
  runIssues: Issue[],
): PlanSummary {
  const issues = [...records.flatMap((record) => record.issues), ...runIssues];
  const count = (severity: IssueSeverity) =>
    issues.filter((issue) => issue.severity === severity).length;

  return {
    records: records.length,
    imported: imports.length,
    skipped: records.length - imports.length,
    bySeverity: {
      error: count("error"),
      warning: count("warning"),
      info: count("info"),
    },
    signers: imports.reduce(
      (total, plannedImport) => total + plannedImport.write.signers.length,
      0,
    ),
    overridesApplied: imports.reduce(
      (total, plannedImport) => total + plannedImport.overrides.length,
      0,
    ),
    orderNamesBackfilled: imports.filter(
      (plannedImport) => plannedImport.write.orderName !== null,
    ).length,
  };
}
