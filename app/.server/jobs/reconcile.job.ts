import type { AdminContext } from "~/.server/gateways/admin-graphql.gateway";
import { listEntries } from "~/.server/gateways/metaobjects.gateway";
import prisma from "~/.server/db/prisma.singleton";
import { codeToHandle, handleToCode } from "~/features/codes/utils/code.utils";
import { log } from "~/.server/logging/logger.service";
import {
  findCodeOwner,
  listCodes,
} from "~/.server/repositories/certificate-codes.repository";
import {
  countCertificates,
  currentVersion,
} from "~/.server/repositories/certificate.repository";
import { isUniqueViolation } from "~/.server/db/prisma-errors.utils";
import {
  enqueueUpsert,
  getQueueRow,
} from "~/.server/repositories/sync-queue.repository";
import { syncSafely } from "~/.server/services/mirror/mirror-sync.service";
import { JOB_ITEM_BUDGET_MS } from "~/.server/services/shared/admin-read.utils";

export type SweepResult = {
  untrackedEntries: number;
  entriesRecreated: number;
};

// Never deletes an entry: after a wiped or misconfigured database the entries without a live
// certificate may be the only backup left (spec §7.4).
export async function reconcileShop(
  context: AdminContext,
): Promise<SweepResult> {
  if ((await countCertificates(context.shop)) === 0) {
    return { untrackedEntries: 0, entriesRecreated: 0 };
  }

  const entryHandles = await listEntryHandles(context);
  const liveCodes = await listCodes(context.shop);
  const liveCodeSet = new Set(liveCodes);
  const untrackedEntries = [...entryHandles].filter(
    (handle) => !liveCodeSet.has(handleToCode(handle)),
  ).length;

  if (untrackedEntries > 0) {
    log.warn("job.untracked_entries", {
      shop: context.shop,
      count: untrackedEntries,
    });
  }

  const missing = liveCodes.filter(
    (code) => !entryHandles.has(codeToHandle(code)),
  );

  return {
    untrackedEntries,
    entriesRecreated: await recreate(context, missing),
  };
}

async function listEntryHandles(context: AdminContext): Promise<Set<string>> {
  const handles = new Set<string>();

  for await (const entry of listEntries(context.admin)) {
    handles.add(entry.handle);
  }

  return handles;
}

async function recreate(
  context: AdminContext,
  codes: string[],
): Promise<number> {
  const recreated: boolean[] = [];

  for (const code of codes) {
    recreated.push(await recreateEntry(context, code));
  }

  return recreated.filter(Boolean).length;
}

async function recreateEntry(
  context: AdminContext,
  code: string,
): Promise<boolean> {
  const certificate = await certificateWithoutQueueRow(context.shop, code);

  if (!certificate) {
    return false;
  }

  await enqueueIntent(context.shop, certificate, codeToHandle(code));
  await syncSafely(context, certificate.id, {
    pace: true,
    signal: AbortSignal.timeout(JOB_ITEM_BUDGET_MS),
  });

  return true;
}

// A certificate with a queue row is the queue's to push: the queue step tried it in this run, or
// the row is fresh and the next run picks it up. Pushing it here too would count two attempts a
// night.
async function certificateWithoutQueueRow(
  shop: string,
  code: string,
): Promise<{ id: string; version: number } | null> {
  const owner = await findCodeOwner(shop, code);

  if (!owner || (await getQueueRow(shop, owner.id))) {
    return null;
  }

  const version = await currentVersion(shop, owner.id);

  return version === null ? null : { id: owner.id, version };
}

async function enqueueIntent(
  shop: string,
  certificate: { id: string; version: number },
  handle: string,
): Promise<void> {
  try {
    await prisma.$transaction((transaction) =>
      enqueueUpsert(transaction, {
        shop,
        certificateId: certificate.id,
        version: certificate.version,
        handle,
      }),
    );
  } catch (error) {
    // No certificate row lock serialises this enqueue: an overlapping run can insert the same
    // intent between our read and our insert.
    if (!isUniqueViolation(error)) {
      throw error;
    }
  }
}
