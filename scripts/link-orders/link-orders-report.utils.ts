import { pluralize } from "~/shared/utils/format.utils";
import type {
  LinkIssue,
  LinkIssueCode,
  LinkMode,
  LinkReport,
  LinkRunInfo,
  LinkSummary,
  ReportLink,
} from "./link-orders.types";

const ISSUE_CODES: LinkIssueCode[] = [
  "AMBIGUOUS",
  "NO_MATCH",
  "ORDER_NOT_FOUND",
  "CAPACITY_FULL",
  "ACCESS_DENIED",
];
const MODE_LABELS: Record<LinkMode, string> = {
  "dry-run": "dry run",
  apply: "apply",
};

export function countIssues(
  issues: readonly LinkIssue[],
): Record<LinkIssueCode, number> {
  const counts = Object.fromEntries(
    ISSUE_CODES.map((code) => [code, 0]),
  ) as Record<LinkIssueCode, number>;

  for (const issue of issues) {
    counts[issue.code]++;
  }

  return counts;
}

export function defaultLinkReportPath(mode: LinkMode, now: Date): string {
  return `.coa-import/${now.toISOString().replace(/:/g, "-")}-link-${mode}.json`;
}

const linkLine = (link: ReportLink) =>
  `  ${link.certificateCode} → ${link.columns.orderName} · ${link.columns.lineItemTitle}`;

const issueLine = (issue: LinkIssue) =>
  `  ${issue.code} ${issue.certificateCode ?? "-"} (${issue.orderName}): ${issue.message}`;

export function formatLinkSummary(report: LinkReport): string {
  const { run, summary, links, issues } = report;
  const counts = ISSUE_CODES.map((code) => `${code} ${summary.issues[code]}`);

  return [
    `Link orders (${MODE_LABELS[run.mode]})`,
    `Shop: ${run.shop}`,
    `Candidates: ${summary.candidates}`,
    `Orders queried: ${summary.ordersQueried}`,
    `Linked: ${summary.linked}`,
    `Issues: ${counts.join(", ")}`,
    `To link (${links.length}):`,
    ...links.map(linkLine),
    `Issues (${issues.length}):`,
    ...issues.map(issueLine),
  ].join("\n");
}

export function linkedText(summary: LinkSummary): string {
  const skipped =
    summary.alreadyLinked > 0
      ? ` Skipped ${pluralize(summary.alreadyLinked, "certificate")} linked meanwhile.`
      : "";

  return `Linked ${pluralize(summary.linked, "certificate")}.${skipped}`;
}

export function buildLinkReport(
  run: LinkRunInfo,
  summary: LinkSummary,
  links: readonly ReportLink[],
  issues: readonly LinkIssue[],
): LinkReport {
  return { run, summary, links: [...links], issues: [...issues] };
}
