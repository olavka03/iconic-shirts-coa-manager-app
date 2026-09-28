import type { AdminContext } from "~/.server/gateways/admin-graphql.gateway";
import { log } from "~/.server/logging/logger.service";
import {
  convertToDelete,
  countFailing,
  dueRows,
  getQueueRow,
  recordFailure,
  type SyncFailureRow,
} from "~/.server/repositories/sync-queue.repository";
import {
  formatSyncError,
  stopKind,
  type StopKind,
} from "./mirror-errors.utils";
import { logSyncFailure } from "./mirror-failures.service";
import {
  deleteMirror,
  syncCertificate,
  type CallOptions,
} from "./mirror-sync.service";
import { JOB_ITEM_BUDGET_MS } from "~/.server/services/shared/admin-read.utils";

export type QueueResult = {
  processed: number;
  fixed: number;
  stillFailing: number;
  stuck: number;
  stopped: StopKind | null;
};

type SettledKind = "fixed" | "unsettled";
type RowOutcome =
  | { kind: SettledKind }
  | { kind: "failed"; attempts: number; stop: StopKind | null };

const STUCK_ATTEMPTS = 7;

async function settleRow(
  context: AdminContext,
  row: SyncFailureRow,
  options: CallOptions,
): Promise<SettledKind> {
  if (row.action === "DELETE") {
    await deleteMirror(context, row, options);

    return "fixed";
  }

  const result = await syncCertificate(context, row.certificateId, options);

  if (result === "gone") {
    await convertToDelete(context.shop, row.certificateId);
    await deleteMirror(context, { ...row, action: "DELETE" }, options);
  }

  return result === "unsettled" ? "unsettled" : "fixed";
}

async function recordRowFailure(
  context: AdminContext,
  row: SyncFailureRow,
  error: unknown,
): Promise<number> {
  // The row may have become a DELETE (certificate gone) or moved on since the run read it.
  const current = (await getQueueRow(context.shop, row.certificateId)) ?? row;

  await recordFailure({
    shop: context.shop,
    certificateId: row.certificateId,
    action: current.action,
    version: current.version,
    handle: current.handle,
    error: formatSyncError(error),
  });

  return (await getQueueRow(context.shop, row.certificateId))?.attempts ?? 0;
}

async function processRow(
  context: AdminContext,
  row: SyncFailureRow,
): Promise<RowOutcome> {
  const options = {
    signal: AbortSignal.timeout(JOB_ITEM_BUDGET_MS),
    pace: true,
  };

  try {
    return { kind: await settleRow(context, row, options) };
  } catch (error) {
    logSyncFailure(context.shop, row.certificateId, error);

    return {
      kind: "failed",
      attempts: await recordRowFailure(context, row, error),
      stop: stopKind(error),
    };
  }
}

export async function processQueue(
  context: AdminContext,
  options: { now: Date; includeFresh: boolean },
): Promise<QueueResult> {
  const result: QueueResult = {
    processed: 0,
    fixed: 0,
    stillFailing: 0,
    stuck: 0,
    stopped: null,
  };
  const rows = await dueRows(context.shop, options.now, {
    includeFresh: options.includeFresh,
  });

  for (const row of rows) {
    result.processed++;
    const outcome = await processRow(context, row);

    if (outcome.kind === "fixed") {
      result.fixed++;
    }

    if (outcome.kind !== "failed") {
      continue;
    }

    if (outcome.attempts >= STUCK_ATTEMPTS) {
      result.stuck++;
      log.error("job.stuck", {
        shop: context.shop,
        certificateId: row.certificateId,
        attempts: outcome.attempts,
      });
    }

    if (outcome.stop) {
      result.stopped = outcome.stop;
      break;
    }
  }

  result.stillFailing = await countFailing(context.shop);

  return result;
}
