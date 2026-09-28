import "./shared/bootstrap.setup";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import type { AdminContext } from "~/.server/gateways/admin-graphql.gateway";
import {
  fetchShopInfo,
  type ShopInfoNode,
} from "~/.server/gateways/shop.gateway";
import prisma from "~/.server/db/prisma.singleton";
import {
  adminForShop,
  classifyAdminForShopError,
  type AdminForShopFailure,
} from "~/.server/shopify/admin-for-shop.service";
import { errorName } from "~/.server/logging/logger.service";
import { listCodes } from "~/.server/repositories/certificate-codes.repository";
import {
  applyPlan,
  hasCertificates,
  pushMirror,
} from "./legacy-import/legacy-apply.service";
import type {
  ImportDependencies,
  ImportPlan,
  RunInfo,
  SourceInfo,
} from "./legacy-import/legacy-import.types";
import {
  learnModelFromRecords,
  planLegacyImport,
} from "./legacy-import/legacy-plan.utils";
import {
  buildReport,
  defaultReportPath,
  formatSummary,
} from "./legacy-import/legacy-report.utils";
import {
  fetchLegacyRecords,
  readLegacyFile,
  type LegacySource,
} from "./legacy-import/legacy-source.gateway";

type Options = {
  shop: string;
  apply: boolean;
  onlyNew: boolean;
  mirror: boolean;
  file: string | null;
  report: string | null;
};
type ParsedOptions =
  { ok: true; options: Options } | { ok: false; message: string };
type PreparedImport = {
  context: AdminContext;
  plan: ImportPlan;
  run: RunInfo;
  source: SourceInfo;
};
type PlanReport = {
  plan: ImportPlan;
  run: RunInfo;
  source: SourceInfo;
  path: string;
};
type ExitCode = (typeof EXIT)[keyof typeof EXIT];

const EXIT = { ok: 0, failed: 1, refused: 2 } as const;
const OPTIONS = {
  shop: { type: "string" },
  apply: { type: "boolean" },
  "only-new": { type: "boolean" },
  "no-mirror": { type: "boolean" },
  file: { type: "string" },
  report: { type: "string" },
} as const;
const USAGE =
  "Usage: npm run import:legacy -- --shop <store>.myshopify.com [--file <records.json>] [--apply [--only-new] [--no-mirror]] [--report <report.json>]";
const NO_ORDER_FORMAT = "Couldn't read the shop's order number format.";
const REFUSED = "Already imported. Use --only-new.";
const SESSION_FAILURES: Record<
  AdminForShopFailure,
  (shop: string, error: unknown) => string
> = {
  no_session: (shop) =>
    `No session for ${shop}. Open the app in the store admin once, then run the import again.`,
  reauth: (shop) =>
    `The session for ${shop} has expired. Open the app in the store admin, then run the import again.`,
  retry: (shop) =>
    `Couldn't reach Shopify for ${shop}. Try again in a few minutes.`,
  fatal: (shop, error) =>
    `Couldn't open a session for ${shop}. ${describeError(error)}`,
};

export async function runImportLegacy(
  commandArguments: string[],
  dependencies: ImportDependencies,
): Promise<number> {
  const parsed = parseOptions(commandArguments);

  if (!parsed.ok) {
    dependencies.print(parsed.message);
    dependencies.print(USAGE);

    return EXIT.failed;
  }

  try {
    return await importLegacy(parsed.options, dependencies);
  } catch (error) {
    dependencies.print(`The import stopped. ${describeError(error)}`);

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

    if (values["no-mirror"] && !values.apply) {
      return { ok: false, message: "--no-mirror needs --apply." };
    }

    if (values.file === "" || values.report === "") {
      return { ok: false, message: "--file and --report need a path." };
    }

    return {
      ok: true,
      options: {
        shop,
        apply: values.apply ?? false,
        onlyNew: values["only-new"] ?? false,
        mirror: !values["no-mirror"],
        file: values.file ?? null,
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

async function importLegacy(
  options: Options,
  dependencies: ImportDependencies,
): Promise<ExitCode> {
  const prepared = await prepareImport(options, dependencies);

  if (typeof prepared === "number") {
    return prepared;
  }

  const { plan, run, source } = prepared;
  const path =
    options.report ?? defaultReportPath(run.mode, new Date(run.startedAt));

  await reportPlan({ plan, run, source, path }, dependencies);

  if (!options.apply) {
    return EXIT.ok;
  }

  return applyImport(prepared, options, dependencies);
}

async function prepareImport(
  options: Options,
  dependencies: ImportDependencies,
): Promise<PreparedImport | ExitCode> {
  const startedAt = dependencies.now();
  const context = await openSession(options.shop, dependencies);

  if (!context) {
    return EXIT.failed;
  }

  const format = await readOrderFormat(context, dependencies);

  if (!format) {
    return EXIT.failed;
  }

  const legacySource =
    options.file !== null
      ? await readLegacyFile(options.file)
      : await fetchLegacyRecords(context.admin);
  const plan = await planImport(context.shop, legacySource, format, startedAt);
  const run: RunInfo = {
    mode: modeOf(options),
    startedAt: startedAt.toISOString(),
    shop: context.shop,
    orderNumberFormatPrefix: format.orderNumberFormatPrefix,
    orderNumberFormatSuffix: format.orderNumberFormatSuffix,
  };

  return { context, plan, run, source: sourceInfo(legacySource) };
}

async function applyImport(
  { context, plan }: PreparedImport,
  options: Options,
  dependencies: ImportDependencies,
): Promise<ExitCode> {
  if (!options.onlyNew && (await hasCertificates(context.shop))) {
    dependencies.print(REFUSED);

    return EXIT.refused;
  }

  const imported = await applyPlan(context.shop, plan, dependencies.now());

  dependencies.print(
    `Imported ${imported} ${imported === 1 ? "certificate" : "certificates"}.`,
  );

  if (options.mirror) {
    await pushMirror(context, imported, dependencies);
  } else {
    dependencies.print(
      "Mirror skipped (--no-mirror). npm run sync:retry pushes the waiting rows.",
    );
  }

  return EXIT.ok;
}

async function openSession(
  shop: string,
  dependencies: ImportDependencies,
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

// A guessed order symbol would be a hardcoded store assumption, so the run stops instead.
async function readOrderFormat(
  context: AdminContext,
  dependencies: ImportDependencies,
): Promise<ShopInfoNode | null> {
  try {
    return await fetchShopInfo(context.admin);
  } catch (error) {
    dependencies.print(NO_ORDER_FORMAT);
    dependencies.print(describeError(error));

    return null;
  }
}

async function planImport(
  shop: string,
  source: LegacySource,
  format: ShopInfoNode,
  now: Date,
): Promise<ImportPlan> {
  return planLegacyImport({
    records: source.records,
    existingCodes: new Set(await listCodes(shop)),
    orderModel: learnModelFromRecords(source.records),
    formatPrefix: format.orderNumberFormatPrefix,
    formatSuffix: format.orderNumberFormatSuffix,
    now,
  });
}

function modeOf(options: Options): RunInfo["mode"] {
  if (!options.apply) {
    return "dry-run";
  }

  return options.onlyNew ? "only-new" : "apply";
}

function sourceInfo(source: LegacySource): SourceInfo {
  return {
    kind: source.kind,
    updatedAt: source.updatedAt,
    bytes: source.bytes,
    records: source.records.length,
  };
}

async function reportPlan(
  { plan, run, source, path }: PlanReport,
  dependencies: ImportDependencies,
): Promise<void> {
  dependencies.print(formatSummary(plan, run, source));
  await dependencies.writeFile(
    path,
    JSON.stringify(buildReport(plan, run, source), null, 2),
  );
  dependencies.print(`Report: ${path}`);
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";

  return message === "" ? errorName(error) : `${errorName(error)}: ${message}`;
}

// The default report directory (.coa-import/) doesn't exist on a fresh clone.
export async function writeReportFile(
  path: string,
  content: string,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

async function main(): Promise<void> {
  try {
    process.exitCode = await runImportLegacy(process.argv.slice(2), {
      adminForShop,
      now: () => new Date(),
      print: (line) => console.log(line),
      writeFile: writeReportFile,
    });
  } finally {
    await prisma.$disconnect();
  }
}

// Tests import runImportLegacy; only a direct run starts the CLI.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(`The import stopped. ${describeError(error)}`);
    process.exitCode = EXIT.failed;
  });
}
