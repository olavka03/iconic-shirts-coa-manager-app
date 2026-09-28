import type { AdminContext } from "~/.server/gateways/admin-graphql.gateway";
import prisma from "~/.server/db/prisma.singleton";
import { codeToHandle } from "~/features/codes/utils/code.utils";
import type {
  MediaKind,
  MediaStatus,
} from "~/features/media/types/media.types";
import {
  MEDIA_KINDS,
  pendingFileIdOf,
  pendingFileIds,
} from "~/features/media/utils/media.utils";
import { errorName, log } from "~/.server/logging/logger.service";
import {
  getCertificate,
  patchSystemFields,
} from "~/.server/repositories/certificate.repository";
import type {
  PendingRow,
  SystemPatch,
} from "~/.server/repositories/certificate.types";
import {
  findPendingByFileIds,
  listPendingFileIds,
} from "~/.server/repositories/pending-media.repository";
import { enqueueUpsert } from "~/.server/repositories/sync-queue.repository";
import { getMediaStatuses } from "~/.server/services/media/media.service";
import { pushInBackground } from "~/.server/services/mirror/mirror-background.service";
import { syncSafely } from "~/.server/services/mirror/mirror-sync.service";
import {
  failureKind,
  REQUEST_BUDGET_MS,
  rethrowAuth,
} from "~/.server/services/shared/admin-read.utils";

type MediaFailure = { certificateId: string; kind: MediaKind; code: string };
type SettledMedia = {
  kind: MediaKind;
  status: MediaStatus;
  code: string | null;
};

const BACKGROUND_COMPLETION_MS = 2_000;
const COMPLETION_INTERVAL_MS = 60_000;
const STATUS_CHUNK_SIZE = 100;

const lastCompletionAt = new Map<string, number>();

function chunked<Item>(items: readonly Item[], size: number): Item[][] {
  const chunks: Item[][] = [];

  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }

  return chunks;
}

async function readFinishedStatuses(
  context: AdminContext,
  fileIds: string[],
  budgetMs: number,
): Promise<Map<string, MediaStatus>> {
  const signal = AbortSignal.timeout(budgetMs);
  const finished = new Map<string, MediaStatus>();

  for (const chunk of chunked([...new Set(fileIds)], STATUS_CHUNK_SIZE)) {
    try {
      const statuses = await getMediaStatuses(context.admin, chunk, { signal });

      for (const status of statuses) {
        if (status.status !== "processing") {
          finished.set(status.id, status);
        }
      }
    } catch (error) {
      rethrowAuth(error);
      log.warn("media.status_unavailable", {
        shop: context.shop,
        kind: failureKind(error),
      });
    }
  }

  return finished;
}

function failureCode(status: MediaStatus): string | null {
  if (status.status === "missing") {
    return "NOT_FOUND";
  }

  return status.status === "failed" ? (status.errorCode ?? "UNKNOWN") : null;
}

function completionPatch({ kind, status, code }: SettledMedia): SystemPatch {
  if (status.status === "ready") {
    return kind === "photo"
      ? { photoUrl: status.url }
      : { videoUrl: status.url, videoPreviewUrl: status.previewUrl };
  }

  if (code === null) {
    return {};
  }

  return kind === "photo"
    ? { photoFileId: null, photoError: code }
    : { videoFileId: null, videoError: code };
}

function rowCompletion(
  row: PendingRow,
  statuses: Map<string, MediaStatus>,
): { patch: SystemPatch; failures: MediaFailure[] } {
  const settled = MEDIA_KINDS.flatMap((kind): SettledMedia[] => {
    const fileId = pendingFileIdOf(row, kind);
    const status = fileId === null ? undefined : statuses.get(fileId);

    return status ? [{ kind, status, code: failureCode(status) }] : [];
  });

  return {
    patch: settled.reduce<SystemPatch>(
      (patch, media) => ({ ...patch, ...completionPatch(media) }),
      {},
    ),
    failures: settled.flatMap(({ kind, code }) =>
      code === null ? [] : [{ certificateId: row.id, kind, code }],
    ),
  };
}

function applyCompletions(shop: string, statuses: Map<string, MediaStatus>) {
  return prisma.$transaction(async (transaction) => {
    const changedIds: string[] = [];
    const failures: MediaFailure[] = [];
    const rows = await findPendingByFileIds(transaction, shop, [
      ...statuses.keys(),
    ]);

    for (const row of rows) {
      const completion = rowCompletion(row, statuses);
      const patched =
        Object.keys(completion.patch).length === 0
          ? null
          : await patchSystemFields(
              transaction,
              shop,
              row.id,
              completion.patch,
            );

      if (patched === null) {
        continue;
      }

      await enqueueUpsert(transaction, {
        shop,
        certificateId: row.id,
        version: patched.version,
        handle: codeToHandle(row.code),
      });
      changedIds.push(row.id);
      failures.push(...completion.failures);
    }

    return { changedIds, failures };
  });
}

export async function completePendingFiles(
  context: AdminContext,
  fileIds: string[],
  options: { budgetMs?: number; awaitMirror?: boolean } = {},
): Promise<{ changedIds: string[] }> {
  const statuses = await readFinishedStatuses(
    context,
    fileIds,
    options.budgetMs ?? REQUEST_BUDGET_MS,
  );

  if (statuses.size === 0) {
    return { changedIds: [] };
  }

  const { changedIds, failures } = await applyCompletions(
    context.shop,
    statuses,
  );

  for (const failure of failures) {
    log.warn("media.failed", { shop: context.shop, ...failure });
  }

  for (const id of changedIds) {
    if (options.awaitMirror) {
      await syncSafely(context, id, { pace: true });
    } else {
      pushInBackground(context, id);
    }
  }

  return { changedIds };
}

export async function completeCertificateMedia(
  context: AdminContext,
  id: string,
): Promise<"not_found" | "completed"> {
  const certificate = await getCertificate(context.shop, id);

  if (!certificate) {
    return "not_found";
  }

  await completePendingFiles(context, pendingFileIds(certificate));

  return "completed";
}

async function completeQuietly(context: AdminContext): Promise<void> {
  try {
    await completePendingFiles(
      context,
      await listPendingFileIds(context.shop),
      {
        budgetMs: BACKGROUND_COMPLETION_MS,
      },
    );
  } catch (error) {
    log.warn("media.completion_failed", {
      shop: context.shop,
      error: errorName(error),
    });
  }
}

// In memory, per process: the index loader calls this on every page load.
export function completePendingInBackground(context: AdminContext): void {
  const now = Date.now();
  const last = lastCompletionAt.get(context.shop);

  if (last !== undefined && now - last < COMPLETION_INTERVAL_MS) {
    return;
  }

  lastCompletionAt.set(context.shop, now);
  void completeQuietly(context);
}

export function resetCompletionThrottle(): void {
  lastCompletionAt.clear();
}
