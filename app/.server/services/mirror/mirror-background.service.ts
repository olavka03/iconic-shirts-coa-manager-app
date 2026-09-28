import type { AdminContext } from "~/.server/gateways/admin-graphql.gateway";
import { errorName, log } from "~/.server/logging/logger.service";
import {
  getQueueRow,
  recordFailure,
  type SyncFailureRow,
} from "~/.server/repositories/sync-queue.repository";
import { formatSyncError } from "./mirror-errors.utils";
import { logSyncFailure, recordQuietly } from "./mirror-failures.service";
import {
  deleteMirror,
  syncSafely,
  type CallOptions,
} from "./mirror-sync.service";
import { REQUEST_BUDGET_MS } from "~/.server/services/shared/admin-read.utils";

const DELETE_BUDGET_MS = 15_000;
const DELETE_CONCURRENCY = 4;

const pending = new Set<Promise<void>>();

async function deleteSafely(
  context: AdminContext,
  row: SyncFailureRow,
  options: CallOptions = {},
): Promise<void> {
  try {
    await deleteMirror(context, row, options);
  } catch (error) {
    logSyncFailure(context.shop, row.certificateId, error);
    await recordQuietly(context.shop, row.certificateId, () =>
      recordFailure({
        shop: context.shop,
        certificateId: row.certificateId,
        action: "DELETE",
        version: row.version,
        handle: row.handle,
        error: formatSyncError(error),
      }),
    );
  }
}

function track(shop: string, task: Promise<void>): void {
  const settled: Promise<void> = task
    .catch((error: unknown) =>
      log.error("mirror.background_failed", {
        shop,
        error: errorName(error),
      }),
    )
    .finally(() => pending.delete(settled));

  pending.add(settled);
}

export function pushInBackground(context: AdminContext, id: string): void {
  track(
    context.shop,
    syncSafely(context, id, { signal: AbortSignal.timeout(REQUEST_BUDGET_MS) }),
  );
}

async function deleteRowsInParallel(
  context: AdminContext,
  ids: string[],
): Promise<void> {
  const signal = AbortSignal.timeout(DELETE_BUDGET_MS);
  const rows = await Promise.all(
    ids.map((id) => getQueueRow(context.shop, id)),
  );
  const queue = rows.filter(
    (row): row is SyncFailureRow => row !== null && row.action === "DELETE",
  );
  const worker = async () => {
    for (let row = queue.shift(); row; row = queue.shift()) {
      await deleteSafely(context, row, { signal });
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(DELETE_CONCURRENCY, queue.length) }, worker),
  );
}

export function deleteInBackground(context: AdminContext, ids: string[]): void {
  track(context.shop, deleteRowsInParallel(context, ids));
}

export async function flushBackgroundMirrors(): Promise<void> {
  while (pending.size > 0) {
    await Promise.allSettled([...pending]);
  }
}
