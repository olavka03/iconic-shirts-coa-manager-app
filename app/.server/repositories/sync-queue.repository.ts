import type { Prisma } from "@prisma/client";
import prisma from "~/.server/db/prisma.singleton";
import { codeToHandle } from "~/features/codes/utils/code.utils";
import { log } from "~/.server/logging/logger.service";
import type { Transaction } from "~/.server/db/db.types";

export type SyncFailureRow = {
  certificateId: string;
  shop: string;
  action: "UPSERT" | "DELETE";
  version: number;
  handle: string;
  staleHandles: string[];
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// Enqueue statements run inside the certificate transaction: the certificate's own row lock
// serialises them, and an upsert can't express "skip when the row is DELETE" (spec §7.7).
export async function enqueueUpsert(
  transaction: Transaction,
  intent: {
    shop: string;
    certificateId: string;
    version: number;
    handle: string;
    previousHandle?: string | null;
  },
): Promise<void> {
  const stale =
    intent.previousHandle && intent.previousHandle !== intent.handle
      ? [intent.previousHandle]
      : [];
  const row = await transaction.syncFailure.findUnique({
    where: { certificateId: intent.certificateId },
  });

  if (!row) {
    await transaction.syncFailure.create({
      data: {
        certificateId: intent.certificateId,
        shop: intent.shop,
        action: "UPSERT",
        version: intent.version,
        handle: intent.handle,
        staleHandles: stale,
        attempts: 0,
      },
    });

    return;
  }

  if (row.action === "DELETE") {
    log.error("queue.invariant", {
      shop: intent.shop,
      certificateId: intent.certificateId,
      action: "UPSERT_ON_DELETE",
    });

    return;
  }

  const staleHandles = [...new Set([...row.staleHandles, ...stale])].filter(
    (staleHandle) => staleHandle !== intent.handle,
  );
  await transaction.syncFailure.update({
    where: { certificateId: intent.certificateId },
    data: {
      version: intent.version,
      handle: intent.handle,
      staleHandles,
      updatedAt: new Date(),
    },
  });
}

export async function enqueueDelete(
  transaction: Transaction,
  intent: {
    shop: string;
    certificateId: string;
    version: number;
    handle: string;
  },
): Promise<void> {
  const row = await transaction.syncFailure.findUnique({
    where: { certificateId: intent.certificateId },
  });

  if (!row) {
    await transaction.syncFailure.create({
      data: {
        certificateId: intent.certificateId,
        shop: intent.shop,
        action: "DELETE",
        version: intent.version,
        handle: intent.handle,
        attempts: 0,
      },
    });

    return;
  }

  // A queued entry under another handle must still be removed, so it moves to staleHandles.
  const staleHandles = [...new Set([...row.staleHandles, row.handle])].filter(
    (staleHandle) => staleHandle !== intent.handle,
  );
  await transaction.syncFailure.update({
    where: { certificateId: intent.certificateId },
    data: {
      action: "DELETE",
      version: intent.version,
      handle: intent.handle,
      staleHandles,
      updatedAt: new Date(),
    },
  });
}

// One conditional DELETE: under READ COMMITTED a concurrent writer's row lock makes Postgres
// re-check version on the new row, so an older push never removes a newer intent.
export async function resolveUpsert(
  shop: string,
  certificateId: string,
  pushedVersion: number,
): Promise<number> {
  const deleted = await prisma.syncFailure.deleteMany({
    where: {
      shop,
      certificateId,
      action: "UPSERT",
      version: { lte: pushedVersion },
    },
  });

  return deleted.count;
}

export async function resolveDelete(
  shop: string,
  certificateId: string,
): Promise<number> {
  const deleted = await prisma.syncFailure.deleteMany({
    where: { shop, certificateId, action: "DELETE" },
  });

  return deleted.count;
}

export async function convertToDelete(
  shop: string,
  certificateId: string,
): Promise<number> {
  const converted = await prisma.syncFailure.updateMany({
    where: { shop, certificateId, action: "UPSERT" },
    data: { action: "DELETE", updatedAt: new Date() },
  });

  return converted.count;
}

export async function recordFailure(failure: {
  shop: string;
  certificateId: string;
  action: "UPSERT" | "DELETE";
  version: number;
  handle: string;
  error: string;
}): Promise<void> {
  const now = new Date();
  const lastError = failure.error.slice(0, 1000);
  const updated = await prisma.syncFailure.updateMany({
    where: {
      shop: failure.shop,
      certificateId: failure.certificateId,
      action: failure.action,
    },
    data: { attempts: { increment: 1 }, lastError, updatedAt: now },
  });

  if (updated.count === 0 && failure.action === "UPSERT") {
    // Resolved concurrently or never recorded: keep a row so the job pushes the current state (§7.7 #6).
    await prisma.syncFailure.createMany({
      data: [
        {
          certificateId: failure.certificateId,
          shop: failure.shop,
          action: "UPSERT",
          version: failure.version,
          handle: failure.handle,
          attempts: 1,
          lastError,
          createdAt: now,
          updatedAt: now,
        },
      ],
      skipDuplicates: true,
    });
  }
}

export function getQueueRow(
  shop: string,
  certificateId: string,
): Promise<SyncFailureRow | null> {
  return prisma.syncFailure.findUnique({ where: { certificateId, shop } });
}

// An intent row younger than 15 minutes may still have its in-request push running.
const FRESH_INTENT_MS = 15 * 60_000;

export function dueRows(
  shop: string,
  now: Date,
  options: { includeFresh: boolean },
): Promise<SyncFailureRow[]> {
  const where: Prisma.SyncFailureWhereInput = options.includeFresh
    ? { shop }
    : {
        shop,
        OR: [
          { attempts: { gt: 0 } },
          { updatedAt: { lt: new Date(now.getTime() - FRESH_INTENT_MS) } },
        ],
      };

  return prisma.syncFailure.findMany({
    where,
    orderBy: [{ updatedAt: "asc" }, { certificateId: "asc" }],
  });
}

export async function shopsWithWork(): Promise<string[]> {
  const [certificates, queueRows] = await Promise.all([
    prisma.certificate.findMany({ distinct: ["shop"], select: { shop: true } }),
    prisma.syncFailure.findMany({ distinct: ["shop"], select: { shop: true } }),
  ]);
  const shops = [...certificates, ...queueRows].map((row) => row.shop);

  return [...new Set(shops)].sort();
}

export function countFailing(shop: string): Promise<number> {
  return prisma.syncFailure.count({ where: { shop, attempts: { gt: 0 } } });
}

export async function enqueueAll(shop: string): Promise<number> {
  const certificates = await prisma.certificate.findMany({
    where: { shop },
    select: { id: true, code: true, version: true },
  });
  const created = await prisma.syncFailure.createMany({
    data: certificates.map((certificate) => ({
      certificateId: certificate.id,
      shop,
      action: "UPSERT" as const,
      version: certificate.version,
      handle: codeToHandle(certificate.code),
      attempts: 0,
    })),
    skipDuplicates: true,
  });

  return created.count;
}
