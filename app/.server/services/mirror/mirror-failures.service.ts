import type { AdminContext } from "~/.server/gateways/admin-graphql.gateway";
import { codeToHandle } from "~/features/codes/utils/code.utils";
import { errorName, log } from "~/.server/logging/logger.service";
import { getCertificate } from "~/.server/repositories/certificate.repository";
import { recordFailure } from "~/.server/repositories/sync-queue.repository";
import { describeFailure, formatSyncError } from "./mirror-errors.utils";

export function logSyncFailure(
  shop: string,
  certificateId: string,
  error: unknown,
): void {
  const { kind, code } = describeFailure(error);

  log.error("mirror.sync_failed", { shop, certificateId, kind, code });
}

export async function recordQuietly(
  shop: string,
  certificateId: string,
  record: () => Promise<void>,
): Promise<void> {
  try {
    await record();
  } catch (dbError) {
    log.error("mirror.record_failed", {
      shop,
      certificateId,
      error: errorName(dbError),
    });
  }
}

export async function recordUpsertFailure(
  context: AdminContext,
  id: string,
  error: unknown,
): Promise<void> {
  const certificate = await getCertificate(context.shop, id);

  // A deleted certificate's DELETE row owns the cleanup.
  if (!certificate) {
    return;
  }

  await recordFailure({
    shop: context.shop,
    certificateId: id,
    action: "UPSERT",
    version: certificate.version,
    handle: codeToHandle(certificate.code),
    error: formatSyncError(error),
  });
}
