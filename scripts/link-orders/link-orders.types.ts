import type { OrderLinkColumns } from "~/.server/repositories/order-links.repository";
import type { ImportDependencies } from "../legacy-import/legacy-import.types";

export type LinkIssueCode =
  | "AMBIGUOUS"
  | "NO_MATCH"
  | "ORDER_NOT_FOUND"
  | "CAPACITY_FULL"
  | "ACCESS_DENIED";
export type LinkIssue = {
  code: LinkIssueCode;
  orderName: string;
  certificateCode: string | null;
  message: string;
};
export type PlannedLink = {
  certificateId: string;
  certificateCode: string;
  capacity: number;
  columns: OrderLinkColumns;
};
export type OrderPlan = { links: PlannedLink[]; issues: LinkIssue[] };
export type LinkPlan = OrderPlan & {
  candidates: number;
  ordersQueried: number;
  stopped: boolean;
};

export type LinkMode = "dry-run" | "apply";
export type LinkRunInfo = {
  mode: LinkMode;
  startedAt: string;
  shop: string;
  orderNumberFormatPrefix: string;
};
export type LinkSummary = {
  candidates: number;
  ordersQueried: number;
  toLink: number;
  linked: number;
  alreadyLinked: number;
  issues: Record<LinkIssueCode, number>;
};
export type ReportLink = Omit<PlannedLink, "certificateId" | "capacity"> & {
  outcome: "planned" | "linked" | "already_linked" | "capacity_full";
};
export type LinkReport = {
  run: LinkRunInfo;
  summary: LinkSummary;
  links: ReportLink[];
  issues: LinkIssue[];
};

export type LinkDependencies = ImportDependencies;
