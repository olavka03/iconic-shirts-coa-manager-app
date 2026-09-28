import type { AdminContext } from "~/.server/gateways/admin-graphql.gateway";
import prisma from "~/.server/db/prisma.singleton";
import { codeToHandle } from "~/features/codes/utils/code.utils";
import { deleteCertificateRows } from "~/.server/repositories/certificate.repository";
import { enqueueDelete } from "~/.server/repositories/sync-queue.repository";
import { dropCodeDictionary } from "~/.server/services/codes/codes.service";
import { deleteInBackground } from "~/.server/services/mirror/mirror-background.service";

// Shopify Files are never deleted: other certificates may share them.
export async function deleteCertificates(
  context: AdminContext,
  ids: string[],
): Promise<{ deleted: { id: string; code: string }[] }> {
  const rows = await prisma.$transaction(async (transaction) => {
    const deleted = await deleteCertificateRows(transaction, context.shop, ids);

    for (const row of deleted) {
      await enqueueDelete(transaction, {
        shop: context.shop,
        certificateId: row.id,
        version: row.version,
        handle: codeToHandle(row.code),
      });
    }

    return deleted;
  });

  deleteInBackground(
    context,
    rows.map((row) => row.id),
  );
  dropCodeDictionary(context.shop);

  return { deleted: rows.map(({ id, code }) => ({ id, code })) };
}
