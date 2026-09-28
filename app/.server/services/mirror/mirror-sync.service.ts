import type { AdminContext } from "~/.server/gateways/admin-graphql.gateway";
import {
  deleteEntry,
  findEntryByHandle,
  upsertEntry,
  type EntryValue,
  type UserErrorResult,
} from "~/.server/gateways/metaobjects.gateway";
import { runTransaction } from "~/.server/db/transaction.utils";
import { codeToHandle, handleToCode } from "~/features/codes/utils/code.utils";
import { log } from "~/.server/logging/logger.service";
import { findCodeOwner } from "~/.server/repositories/certificate-codes.repository";
import {
  currentVersion,
  getMirrorSnapshot,
  patchSystemFields,
} from "~/.server/repositories/certificate.repository";
import type { MirrorSource } from "~/.server/repositories/certificate.types";
import {
  enqueueUpsert,
  resolveDelete,
  resolveUpsert,
  type SyncFailureRow,
} from "~/.server/repositories/sync-queue.repository";
import {
  clearDefinitionMemo,
  ensureDefinition,
  isDefinitionError,
} from "./mirror-definition.service";
import { throwIfFailed } from "./mirror-errors.utils";
import {
  logSyncFailure,
  recordQuietly,
  recordUpsertFailure,
} from "./mirror-failures.service";
import { toMetaobjectValues } from "./mirror-values.utils";

export type CallOptions = { signal?: AbortSignal; pace?: boolean };
type SyncResult = "synced" | "gone" | "unsettled";

const SYNC_ROUNDS = 3;

const productRejectionLogged = new Set<string>();

export function resetMirrorMemos(): void {
  clearDefinitionMemo();
  productRejectionLogged.clear();
}

const isProductError = (error: UserErrorResult) =>
  error.code === "INVALID_VALUE" &&
  (error.elementKey === "product" || (error.field ?? []).includes("product"));

async function upsertWithDefinition(
  context: AdminContext,
  handle: string,
  values: Record<string, EntryValue>,
  options: CallOptions,
) {
  const firstAttempt = await upsertEntry(
    context.admin,
    handle,
    values,
    options,
  );

  if (firstAttempt.ok || !isDefinitionError(firstAttempt)) {
    return firstAttempt;
  }

  await ensureDefinition(context.admin, context.shop, {
    force: true,
    signal: options.signal,
  });

  return upsertEntry(context.admin, handle, values, options);
}

function logProductRejection(
  shop: string,
  certificateId: string,
  error: UserErrorResult,
): void {
  if (productRejectionLogged.has(shop)) {
    return;
  }

  productRejectionLogged.add(shop);
  log.warn("mirror.product_reference_rejected", {
    shop,
    certificateId,
    message: error.message,
    field: (error.field ?? []).join("."),
    elementKey: error.elementKey ?? null,
  });
}

async function dropProductLink(
  context: AdminContext,
  certificate: MirrorSource,
  error: UserErrorResult,
): Promise<void> {
  logProductRejection(context.shop, certificate.id, error);
  await runTransaction(async (transaction) => {
    const patched = await patchSystemFields(
      transaction,
      context.shop,
      certificate.id,
      {
        productId: null,
        productTitle: null,
        productImageUrl: null,
      },
    );

    // Any other write since the snapshot enqueued its own intent with the right handles; an
    // intent built from the snapshot's code would drop a rename's stale handle.
    if (patched?.version === certificate.version + 1) {
      await enqueueUpsert(transaction, {
        shop: context.shop,
        certificateId: certificate.id,
        version: patched.version,
        handle: codeToHandle(certificate.code),
      });
    }
  });
}

// chain: the certificates whose push is running further up this call, each of which has already
// written its own entry. Re-pushing one of them again would loop forever on a code swap.
async function pushRound(
  context: AdminContext,
  id: string,
  options: CallOptions,
  chain: readonly string[],
): Promise<SyncResult | "again"> {
  const { certificate, row } = await getMirrorSnapshot(context.shop, id);

  if (!certificate) {
    return "gone";
  }

  await ensureDefinition(context.admin, context.shop, {
    signal: options.signal,
  });
  const result = await upsertWithDefinition(
    context,
    codeToHandle(certificate.code),
    toMetaobjectValues(certificate),
    options,
  );

  if (!result.ok && isProductError(result) && certificate.productId !== null) {
    await dropProductLink(context, certificate, result);

    return "again";
  }

  throwIfFailed(result);

  for (const handle of row?.staleHandles ?? []) {
    await removeEntryUnlessOwned(context, handle, options, chain);
  }

  await resolveUpsert(context.shop, id, certificate.version);

  return (await currentVersion(context.shop, id)) === certificate.version
    ? "synced"
    : "again";
}

async function syncInChain(
  context: AdminContext,
  id: string,
  options: CallOptions,
  chain: readonly string[],
): Promise<SyncResult> {
  for (let round = 0; round < SYNC_ROUNDS; round++) {
    const result = await pushRound(context, id, options, chain);

    if (result !== "again") {
      return result;
    }
  }

  return "unsettled";
}

export function syncCertificate(
  context: AdminContext,
  id: string,
  options: CallOptions = {},
): Promise<SyncResult> {
  return syncInChain(context, id, options, [id]);
}

async function repushOwner(
  context: AdminContext,
  ownerId: string,
  handle: string,
  options: CallOptions,
  chain: readonly string[],
): Promise<void> {
  const version = await currentVersion(context.shop, ownerId);

  if (version === null) {
    return;
  }

  await runTransaction((transaction) =>
    enqueueUpsert(transaction, {
      shop: context.shop,
      certificateId: ownerId,
      version,
      handle,
    }),
  );
  await syncSafelyInChain(context, ownerId, options, [...chain, ownerId]);
}

async function removeEntryUnlessOwned(
  context: AdminContext,
  handle: string,
  options: CallOptions,
  chain: readonly string[],
): Promise<void> {
  const owner = await findCodeOwner(context.shop, handleToCode(handle));

  // The code is live again (reused or renamed back), so the entry is the owner's. An older push
  // may have written stale content under it: push the owner again instead of deleting.
  if (owner) {
    if (!chain.includes(owner.id)) {
      await repushOwner(context, owner.id, handle, options, chain);
    }

    return;
  }

  const entry = await findEntryByHandle(context.admin, handle, options);

  if (!entry) {
    return;
  }

  const deleted = await deleteEntry(context.admin, entry.id, options);

  throwIfFailed(deleted);
}

export async function deleteMirror(
  context: AdminContext,
  row: SyncFailureRow,
  options: CallOptions = {},
): Promise<void> {
  for (const handle of new Set([row.handle, ...row.staleHandles])) {
    await removeEntryUnlessOwned(context, handle, options, []);
  }

  await resolveDelete(context.shop, row.certificateId);
}

async function syncSafelyInChain(
  context: AdminContext,
  id: string,
  options: CallOptions,
  chain: readonly string[],
): Promise<void> {
  try {
    await syncInChain(context, id, options, chain);
  } catch (error) {
    logSyncFailure(context.shop, id, error);
    await recordQuietly(context.shop, id, () =>
      recordUpsertFailure(context, id, error),
    );
  }
}

export function syncSafely(
  context: AdminContext,
  id: string,
  options: CallOptions = {},
): Promise<void> {
  return syncSafelyInChain(context, id, options, [id]);
}
