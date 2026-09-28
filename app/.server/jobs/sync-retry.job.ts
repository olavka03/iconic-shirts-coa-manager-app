import { setTimeout as delay } from "node:timers/promises";
import type { AdminContext } from "~/.server/gateways/admin-graphql.gateway";
import { errorName, log } from "~/.server/logging/logger.service";
import { listPendingFileIds } from "~/.server/repositories/pending-media.repository";
import {
  countFailing,
  dueRows,
  enqueueAll,
  shopsWithWork,
} from "~/.server/repositories/sync-queue.repository";
import { completePendingFiles } from "~/.server/services/certificates/media-completion.service";
import { ensureDefinition } from "~/.server/services/mirror/mirror-definition.service";
import { processQueue } from "~/.server/services/mirror/mirror-queue.service";
import {
  adminForShop,
  classifyAdminForShopError,
  type AdminForShop,
} from "~/.server/shopify/admin-for-shop.service";
import { reconcileShop, type SweepResult } from "./reconcile.job";

export type ShopJobResult = {
  shop: string;
  processed: number;
  fixed: number;
  stillFailing: number;
  stuck: number;
  mediaResolved: number;
  untrackedEntries: number;
  entriesRecreated: number;
  skipped?: "no_session" | "reauth_required" | "unavailable";
};
export type JobDependencies = {
  adminForShop: AdminForShop;
  sleep: (durationMs: number) => Promise<void>;
};
export type JobOptions = {
  shop?: string;
  all?: boolean;
  dryRun?: boolean;
  now?: Date;
};

type SkipReason = NonNullable<ShopJobResult["skipped"]>;
type Connection = { context: AdminContext } | { skipped: SkipReason };
type ShopRun = { now: Date; all: boolean; dryRun: boolean };

const REFRESH_RETRY_DELAY_MS = 30_000;
const NO_SWEEP: SweepResult = { untrackedEntries: 0, entriesRecreated: 0 };
const DEFAULT_DEPENDENCIES: JobDependencies = {
  adminForShop,
  sleep: (durationMs) => delay(durationMs),
};

// No lock: every step is idempotent, so an overlapping run or a UI push can't corrupt anything.
export async function runSyncRetryJob(
  options: JobOptions,
  dependencies: JobDependencies = DEFAULT_DEPENDENCIES,
): Promise<ShopJobResult[]> {
  const run: ShopRun = {
    now: options.now ?? new Date(),
    all: options.all === true,
    dryRun: options.dryRun === true,
  };
  const shops =
    options.shop === undefined ? await shopsWithWork() : [options.shop];
  const results: ShopJobResult[] = [];

  for (const shop of shops) {
    results.push(await runShopSafely(shop, run, dependencies));
  }

  return results;
}

async function runShopSafely(
  shop: string,
  run: ShopRun,
  dependencies: JobDependencies,
): Promise<ShopJobResult> {
  try {
    return run.dryRun
      ? await planShop(shop, run.now)
      : await runShop(shop, run, dependencies);
  } catch (error) {
    log.error("job.shop_failed", { shop, error: errorName(error) });

    return { ...emptyResult(shop), skipped: "unavailable" };
  }
}

async function runShop(
  shop: string,
  run: ShopRun,
  dependencies: JobDependencies,
): Promise<ShopJobResult> {
  const connection = await connect(shop, dependencies);

  if ("skipped" in connection) {
    return { ...emptyResult(shop), skipped: connection.skipped };
  }

  const { context } = connection;

  if (run.all) {
    await enqueueAll(shop);
  }

  const media = await completePendingFiles(
    context,
    await listPendingFileIds(shop),
    { awaitMirror: true },
  );

  await ensureDefinition(context.admin, shop, { force: true });
  // Rows --all just enqueued are fresh, so the next run pushes them (spec §7.8 step 4).
  const queue = await processQueue(context, {
    now: run.now,
    includeFresh: false,
  });
  const sweep =
    queue.stopped === null ? await reconcileShop(context) : NO_SWEEP;

  return {
    shop,
    processed: queue.processed,
    fixed: queue.fixed,
    // Counted again because the sweep's pushes can fail too.
    stillFailing: await countFailing(shop),
    stuck: queue.stuck,
    mediaResolved: media.changedIds.length,
    ...sweep,
  };
}

async function planShop(shop: string, now: Date): Promise<ShopJobResult> {
  const rows = await dueRows(shop, now, { includeFresh: false });

  return {
    ...emptyResult(shop),
    processed: rows.length,
    stillFailing: rows.filter((row) => row.attempts > 0).length,
    mediaResolved: (await listPendingFileIds(shop)).length,
  };
}

async function connect(
  shop: string,
  dependencies: JobDependencies,
): Promise<Connection> {
  const firstAttempt = await tryConnect(shop, dependencies);

  if (firstAttempt !== "retry") {
    return firstAttempt;
  }

  await dependencies.sleep(REFRESH_RETRY_DELAY_MS);
  const secondAttempt = await tryConnect(shop, dependencies);

  return secondAttempt === "retry" ? { skipped: "unavailable" } : secondAttempt;
}

async function tryConnect(
  shop: string,
  dependencies: JobDependencies,
): Promise<Connection | "retry"> {
  try {
    return { context: await dependencies.adminForShop(shop) };
  } catch (error) {
    return failedConnection(shop, error);
  }
}

function failedConnection(shop: string, error: unknown): Connection | "retry" {
  switch (classifyAdminForShopError(error)) {
    case "no_session":
      return { skipped: "no_session" };
    case "retry":
      return "retry";
    case "reauth":
      // Waiting doesn't help: the next staff visit to the app stores a new offline token.
      log.warn("job.reauth_required", { shop });

      return { skipped: "reauth_required" };
    case "fatal":
      throw error;
  }
}

function emptyResult(shop: string): ShopJobResult {
  return {
    shop,
    processed: 0,
    fixed: 0,
    stillFailing: 0,
    stuck: 0,
    mediaResolved: 0,
    ...NO_SWEEP,
  };
}
