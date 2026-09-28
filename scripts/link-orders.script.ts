import "./shared/bootstrap.setup";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  isAdminApiError,
  type AdminContext,
} from "~/.server/gateways/admin-graphql.gateway";
import {
  findOrderByName,
  type LinkableOrder,
} from "~/.server/gateways/orders.gateway";
import {
  fetchShopInfo,
  type ShopInfoNode,
} from "~/.server/gateways/shop.gateway";
import prisma from "~/.server/db/prisma.singleton";
import type { TeamDictionary } from "~/features/codes/types/code-generator.types";
import {
  normalizeOrderSearch,
  orderNameSymbols,
  orderSearchQuery,
} from "~/features/orders/utils/orders.utils";
import { errorName } from "~/.server/logging/logger.service";
import {
  certificatesByLineItems,
  unlinkedNamedCertificates,
  type UnlinkedCertificateRow,
} from "~/.server/repositories/order-links.repository";
import { linkCertificateToOrder } from "~/.server/services/certificates/certificate-link.service";
import { getCodeDictionary } from "~/.server/services/codes/codes.service";
import {
  adminForShop,
  classifyAdminForShopError,
  type AdminForShopFailure,
} from "~/.server/shopify/admin-for-shop.service";
import { writeReportFile } from "./import-legacy.script";
import { pushMirror } from "./legacy-import/legacy-apply.service";
import {
  groupByOrderName,
  issuesForOrder,
  planOrderLinks,
} from "./link-orders/link-orders-plan.utils";
import {
  buildLinkReport,
  countIssues,
  defaultLinkReportPath,
  formatLinkSummary,
  linkedText,
} from "./link-orders/link-orders-report.utils";
import type {
  LinkDependencies,
  LinkIssue,
  LinkPlan,
  LinkRunInfo,
  OrderPlan,
  PlannedLink,
  ReportLink,
} from "./link-orders/link-orders.types";

type Options = { shop: string; apply: boolean; report: string | null };
type ParsedOptions =
  { ok: true; options: Options } | { ok: false; message: string };
type OrderGroup = {
  orderName: string;
  certificates: UnlinkedCertificateRow[];
};
type PlanContext = {
  context: AdminContext;
  symbols: string;
  dictionary: TeamDictionary;
};
type OrderResult = OrderPlan & { stopped: boolean };
type AppliedLinks = {
  links: ReportLink[];
  issues: LinkIssue[];
  linked: number;
  alreadyLinked: number;
};
type ExitCode = (typeof EXIT)[keyof typeof EXIT];

const EXIT = { ok: 0, failed: 1 } as const;
const OPTIONS = {
  shop: { type: "string" },
  apply: { type: "boolean" },
  report: { type: "string" },
} as const;
const USAGE =
  "Usage: npm run link:orders -- --shop <store>.myshopify.com [--apply] [--report <report.json>]";
const NO_ORDER_FORMAT = "Couldn't read the shop's order number format.";
const NOT_FOUND = "Shopify has no order with this name.";
const NOT_QUERIED = "Not queried: the run stopped at an order access error.";
const CAPACITY_TAKEN =
  "The item was filled by another certificate during the run.";
const SESSION_FAILURES: Record<
  AdminForShopFailure,
  (shop: string, error: unknown) => string
> = {
  no_session: (shop) =>
    `No session for ${shop}. Open the app in the store admin once, then run link:orders again.`,
  reauth: (shop) =>
    `The session for ${shop} has expired. Open the app in the store admin, then run link:orders again.`,
  retry: (shop) =>
    `Couldn't reach Shopify for ${shop}. Try again in a few minutes.`,
  fatal: (shop, error) =>
    `Couldn't open a session for ${shop}. ${describeError(error)}`,
};

export async function runLinkOrders(
  commandArguments: string[],
  dependencies: LinkDependencies,
): Promise<number> {
  const parsed = parseOptions(commandArguments);

  if (!parsed.ok) {
    dependencies.print(parsed.message);
    dependencies.print(USAGE);

    return EXIT.failed;
  }

  try {
    return await linkOrders(parsed.options, dependencies);
  } catch (error) {
    dependencies.print(`The link run stopped. ${describeError(error)}`);

    return EXIT.failed;
  }
}

function parseOptions(commandArguments: string[]): ParsedOptions {
  try {
    const { values } = parseArgs({ args: commandArguments, options: OPTIONS });
    const shop = values.shop?.trim() ?? "";

    if (shop === "") {
      return { ok: false, message: "--shop is required." };
    }

    if (values.report === "") {
      return { ok: false, message: "--report needs a path." };
    }

    return {
      ok: true,
      options: {
        shop,
        apply: values.apply ?? false,
        report: values.report ?? null,
      },
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function linkOrders(
  options: Options,
  dependencies: LinkDependencies,
): Promise<ExitCode> {
  const startedAt = dependencies.now();
  const context = await openSession(options.shop, dependencies);

  if (!context) {
    return EXIT.failed;
  }

  const format = await readOrderFormat(context, dependencies);

  if (!format) {
    return EXIT.failed;
  }

  const plan = await planLinks(context, format);
  const shouldApply = options.apply && !plan.stopped;
  const applied = shouldApply
    ? await applyLinks(context.shop, plan.links)
    : plannedOnly(plan.links);
  const run: LinkRunInfo = {
    mode: options.apply ? "apply" : "dry-run",
    startedAt: startedAt.toISOString(),
    shop: context.shop,
    orderNumberFormatPrefix: format.orderNumberFormatPrefix,
  };
  const issues = [...plan.issues, ...applied.issues];
  const summary = {
    candidates: plan.candidates,
    ordersQueried: plan.ordersQueried,
    toLink: plan.links.length,
    linked: applied.linked,
    alreadyLinked: applied.alreadyLinked,
    issues: countIssues(issues),
  };
  const report = buildLinkReport(run, summary, applied.links, issues);
  const path = options.report ?? defaultLinkReportPath(run.mode, startedAt);

  dependencies.print(formatLinkSummary(report));
  await dependencies.writeFile(path, JSON.stringify(report, null, 2));
  dependencies.print(`Report: ${path}`);

  if (plan.stopped) {
    dependencies.print(
      "Stopped: the orders can't be read. Check the app's order access, then run it again.",
    );

    return EXIT.failed;
  }

  if (shouldApply) {
    dependencies.print(linkedText(summary));
    await pushMirror(context, applied.linked, dependencies);
  }

  return EXIT.ok;
}

async function planLinks(
  context: AdminContext,
  format: ShopInfoNode,
): Promise<LinkPlan> {
  const certificates = await unlinkedNamedCertificates(context.shop);
  const planContext: PlanContext = {
    context,
    symbols: orderNameSymbols(format.orderNumberFormatPrefix),
    dictionary: await getCodeDictionary(context),
  };
  const plan: LinkPlan = {
    candidates: certificates.length,
    ordersQueried: 0,
    links: [],
    issues: [],
    stopped: false,
  };

  for (const [orderName, group] of groupByOrderName(certificates)) {
    if (plan.stopped) {
      plan.issues.push(
        ...issuesForOrder("ACCESS_DENIED", orderName, group, NOT_QUERIED),
      );
      continue;
    }

    const result = await planOrder(planContext, {
      orderName,
      certificates: group,
    });

    plan.ordersQueried++;
    plan.links.push(...result.links);
    plan.issues.push(...result.issues);
    plan.stopped = result.stopped;
  }

  return plan;
}

async function planOrder(
  { context, symbols, dictionary }: PlanContext,
  { orderName, certificates }: OrderGroup,
): Promise<OrderResult> {
  const orderIssues = (code: LinkIssue["code"], message: string) =>
    issuesForOrder(code, orderName, certificates, message);
  const term = normalizeOrderSearch(orderName);
  const query = orderSearchQuery(term, symbols, { allStatuses: true });

  if (term === null || query === null) {
    return {
      links: [],
      issues: orderIssues("ORDER_NOT_FOUND", NOT_FOUND),
      stopped: false,
    };
  }

  const found = await readOrder(context, orderName, query);

  if (!found.ok) {
    return {
      links: [],
      issues: orderIssues("ACCESS_DENIED", found.message),
      stopped: true,
    };
  }

  if (!found.order) {
    return {
      links: [],
      issues: orderIssues("ORDER_NOT_FOUND", NOT_FOUND),
      stopped: false,
    };
  }

  const byLineItem = await certificatesByLineItems(
    context.shop,
    found.order.lineItems.map((item) => item.id),
  );
  const linkedCounts = new Map(
    [...byLineItem].map(([lineItemId, linked]) => [lineItemId, linked.length]),
  );

  return {
    ...planOrderLinks({
      order: found.order,
      certificates,
      linkedCounts,
      dictionary,
    }),
    stopped: false,
  };
}

// Access and auth errors stop the run; any other failure stops it too, through runLinkOrders.
async function readOrder(
  context: AdminContext,
  orderName: string,
  query: string,
): Promise<
  { ok: true; order: LinkableOrder | null } | { ok: false; message: string }
> {
  try {
    return {
      ok: true,
      order: await findOrderByName(
        context.admin,
        { orderName, query },
        { pace: true },
      ),
    };
  } catch (error) {
    if (error instanceof Response) {
      return {
        ok: false,
        message: `The session was rejected (${error.status}).`,
      };
    }

    if (
      isAdminApiError(error) &&
      (error.kind === "access_denied" || error.kind === "auth")
    ) {
      return { ok: false, message: error.message };
    }

    throw error;
  }
}

// One transaction per certificate, so a stopped run can simply be run again.
async function applyLinks(
  shop: string,
  links: readonly PlannedLink[],
): Promise<AppliedLinks> {
  const applied: AppliedLinks = {
    links: [],
    issues: [],
    linked: 0,
    alreadyLinked: 0,
  };

  for (const link of links) {
    const outcome = await linkCertificateToOrder(
      shop,
      link.certificateId,
      link.columns,
      link.capacity,
    );

    applied.links.push(reportLink(link, outcome));

    if (outcome === "linked") {
      applied.linked++;
    }

    if (outcome === "already_linked") {
      applied.alreadyLinked++;
    }

    if (outcome === "capacity_full") {
      applied.issues.push({
        code: "CAPACITY_FULL",
        orderName: link.columns.orderName,
        certificateCode: link.certificateCode,
        message: CAPACITY_TAKEN,
      });
    }
  }

  return applied;
}

function plannedOnly(links: readonly PlannedLink[]): AppliedLinks {
  return {
    links: links.map((link) => reportLink(link, "planned")),
    issues: [],
    linked: 0,
    alreadyLinked: 0,
  };
}

function reportLink(
  { certificateCode, columns }: PlannedLink,
  outcome: ReportLink["outcome"],
): ReportLink {
  return { certificateCode, columns, outcome };
}

async function openSession(
  shop: string,
  dependencies: LinkDependencies,
): Promise<AdminContext | null> {
  try {
    return await dependencies.adminForShop(shop);
  } catch (error) {
    dependencies.print(
      SESSION_FAILURES[classifyAdminForShopError(error)](shop, error),
    );

    return null;
  }
}

// orderNameSymbols needs the shop's own prefix; a guessed one would be a hardcoded store assumption.
async function readOrderFormat(
  context: AdminContext,
  dependencies: LinkDependencies,
): Promise<ShopInfoNode | null> {
  try {
    return await fetchShopInfo(context.admin);
  } catch (error) {
    dependencies.print(NO_ORDER_FORMAT);
    dependencies.print(describeError(error));

    return null;
  }
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";

  return message === "" ? errorName(error) : `${errorName(error)}: ${message}`;
}

async function main(): Promise<void> {
  try {
    process.exitCode = await runLinkOrders(process.argv.slice(2), {
      adminForShop,
      now: () => new Date(),
      print: (line) => console.log(line),
      writeFile: writeReportFile,
    });
  } finally {
    await prisma.$disconnect();
  }
}

// Tests import runLinkOrders; only a direct run starts the CLI.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(`The link run stopped. ${describeError(error)}`);
    process.exitCode = EXIT.failed;
  });
}
