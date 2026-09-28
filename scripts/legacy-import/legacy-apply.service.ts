import type { AdminContext } from "~/.server/gateways/admin-graphql.gateway";
import { countCertificates } from "~/.server/repositories/certificate.repository";
import { dueRows } from "~/.server/repositories/sync-queue.repository";
import { importCertificate } from "~/.server/services/certificates/certificate-import.service";
import { ensureDefinition } from "~/.server/services/mirror/mirror-definition.service";
import {
  processQueue,
  type QueueResult,
} from "~/.server/services/mirror/mirror-queue.service";
import type { ImportDependencies, ImportPlan } from "./legacy-import.types";

export async function hasCertificates(shop: string): Promise<boolean> {
  return (await countCertificates(shop)) > 0;
}

// Index 0 is the newest record. Importing oldest first, 1 ms apart, makes "Date created, newest
// first" reproduce the legacy order. One transaction per record, so a stopped run can resume.
export async function applyPlan(
  shop: string,
  plan: ImportPlan,
  runStartedAt: Date,
): Promise<number> {
  const oldestFirst = [...plan.imports].reverse();

  for (const [offsetMs, plannedImport] of oldestFirst.entries()) {
    await importCertificate(shop, plannedImport.write, {
      createdAt: new Date(runStartedAt.getTime() + offsetMs),
    });
  }

  return oldestFirst.length;
}

// Rows left by an earlier --no-mirror run are pushed too.
export async function pushMirror(
  context: AdminContext,
  imported: number,
  dependencies: ImportDependencies,
): Promise<void> {
  const now = dependencies.now();
  const waiting =
    imported > 0 ||
    (await dueRows(context.shop, now, { includeFresh: true })).length > 0;

  if (!waiting) {
    dependencies.print("Mirror: nothing to push.");

    return;
  }

  await ensureDefinition(context.admin, context.shop, { force: true });
  dependencies.print(
    queueText(await processQueue(context, { now, includeFresh: true })),
  );
}

function queueText(result: QueueResult): string {
  const counts = `Mirror: processed ${result.processed}, fixed ${result.fixed}, still failing ${result.stillFailing}, stuck ${result.stuck}.`;

  return result.stopped
    ? `${counts} Stopped early (${result.stopped}); npm run sync:retry retries the rest.`
    : counts;
}
