import prisma from "~/.server/db/prisma.singleton";
import { codeToHandle } from "~/features/codes/utils/code.utils";
import { insertCertificate } from "~/.server/repositories/certificate.repository";
import type { CertificateWrite } from "~/.server/repositories/certificate.types";
import { enqueueUpsert } from "~/.server/repositories/sync-queue.repository";
import { dropCodeDictionary } from "~/.server/services/codes/codes.service";

export async function importCertificate(
  shop: string,
  write: CertificateWrite,
  timestamps: { createdAt: Date },
): Promise<{ id: string }> {
  const id = await prisma.$transaction(async (transaction) => {
    const imported = await insertCertificate(transaction, shop, write, {
      createdAt: timestamps.createdAt,
    });

    await enqueueUpsert(transaction, {
      shop,
      certificateId: imported.id,
      version: imported.version,
      handle: codeToHandle(imported.code),
    });

    return imported.id;
  });

  dropCodeDictionary(shop);

  return { id };
}
