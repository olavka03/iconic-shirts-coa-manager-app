import type { SignerLike } from "~/features/signers/utils/signer-text.utils";
import type { OrderNumberModel } from "./legacy-order-names.utils";
import type { CertificateWrite } from "~/.server/repositories/certificate.types";
import type { AdminForShop } from "~/.server/shopify/admin-for-shop.service";
import type { AppliedOverride } from "./legacy-overrides.utils";

export type LegacyRecord = Record<string, unknown>;
export type IssueSeverity = "error" | "warning" | "info";
export type IssueCode =
  | "SIGNERS_UNPARSED"
  | "DATE_UNPARSED"
  | "UNMATCHED_SIGNER"
  | "MISSING_YEAR"
  | "NAMES_DIFFER"
  | "ITEM_MISSING"
  | "LOCATION_IS_ITEM"
  | "PHOTO_NOT_URL"
  | "PHOTO_NOT_SHOPIFY_CDN"
  | "VIDEO_NOT_URL"
  | "VIDEO_IS_IMAGE"
  | "OVERRIDE_APPLIED"
  | "NOTE"
  | "EMPTY_CODE"
  | "INVALID_CODE"
  | "DUPLICATE_IDENTICAL"
  | "CODE_CONFLICT"
  | "EXISTS_IN_APP"
  | "PARSE_ERROR"
  | "ORDER_NOT_BACKFILLED"
  | "ORDER_PREFIX_UNSUPPORTED";
export type Issue = {
  severity: IssueSeverity;
  code: IssueCode;
  message: string;
};
export type SignerPattern = "a" | "b1" | "b2" | "c" | "d";
export type ParsedLegacy = {
  code: string;
  item: string;
  notes: string;
  photoUrl: string | null;
  videoUrl: string | null;
  signers: SignerLike[];
  pattern: SignerPattern;
  issues: Issue[];
  overrides: AppliedOverride[];
};

export type AddIssue = (
  severity: IssueSeverity,
  code: IssueCode,
  message: string,
) => void;

export type PlannedSigner = {
  name: string;
  date: string | null;
  precision: "DAY" | "MONTH" | null;
  location: string | null;
};
export type PlannedRecord = {
  index: number;
  code: string;
  action: "import" | "skip";
  pattern: SignerPattern | null;
  orderName: string | null;
  signers: PlannedSigner[];
  overrides: AppliedOverride[];
  issues: Issue[];
  raw: unknown;
};
export type PlannedImport = {
  index: number;
  code: string;
  overrides: AppliedOverride[];
  write: CertificateWrite;
};
export type PlanSummary = {
  records: number;
  imported: number;
  skipped: number;
  bySeverity: Record<IssueSeverity, number>;
  signers: number;
  overridesApplied: number;
  orderNamesBackfilled: number;
};
export type ImportPlan = {
  records: PlannedRecord[];
  imports: PlannedImport[];
  runIssues: Issue[];
  summary: PlanSummary;
};
export type PlanInput = {
  records: readonly unknown[];
  existingCodes: ReadonlySet<string>;
  orderModel: OrderNumberModel | null;
  formatPrefix: string;
  formatSuffix: string;
  now?: Date;
};

export type PlanContext = {
  input: PlanInput;
  prefixSupported: boolean;
  firstSeen: Map<string, { index: number; hash: string }>;
};

export type RunInfo = {
  mode: "dry-run" | "apply" | "only-new";
  startedAt: string;
  shop: string;
  orderNumberFormatPrefix: string;
  orderNumberFormatSuffix: string;
};
export type SourceInfo = {
  kind: "shop" | "file";
  updatedAt: string | null;
  bytes: number;
  records: number;
};
export type ReportRecord = Omit<PlannedRecord, "raw"> & { raw?: unknown };
export type ImportReport = {
  run: RunInfo;
  source: SourceInfo;
  summary: Omit<PlanSummary, "records">;
  records: ReportRecord[];
};

export type ImportDependencies = {
  adminForShop: AdminForShop;
  now: () => Date;
  print: (line: string) => void;
  writeFile: (path: string, content: string) => Promise<void>;
};
