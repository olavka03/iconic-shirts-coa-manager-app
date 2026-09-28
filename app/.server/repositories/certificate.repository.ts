import { Prisma } from "@prisma/client";
import prisma from "~/.server/db/prisma.singleton";
import type { VerificationSource } from "~/features/certificates/utils/verification.utils";
import {
  derivedColumns,
  RECORD_SELECT,
  REFERENCE_SELECT,
  signerRows,
  SIGNERS,
  toRecord,
  toSigner,
  writeColumns,
} from "./certificate-mapping.utils";
import type { Db, Transaction } from "~/.server/db/db.types";
import { runTransaction } from "~/.server/db/transaction.utils";
import type {
  CertificateRecord,
  CertificateWrite,
  MirrorSource,
  SystemPatch,
} from "./certificate.types";
import type { SyncFailureRow } from "./sync-queue.repository";

export async function getCertificate(
  shop: string,
  id: string,
): Promise<CertificateRecord | null> {
  const certificate = await prisma.certificate.findFirst({
    where: { id, shop },
    select: RECORD_SELECT,
  });

  return certificate ? toRecord(certificate) : null;
}

export async function getVerificationSource(
  shop: string,
  code: string,
): Promise<VerificationSource | null> {
  const certificate = await prisma.certificate.findUnique({
    where: { shop_code: { shop, code } },
    select: {
      code: true,
      item: true,
      notes: true,
      photoUrl: true,
      videoUrl: true,
      signers: SIGNERS,
    },
  });

  return certificate
    ? { ...certificate, signers: certificate.signers.map(toSigner) }
    : null;
}

export async function insertCertificate(
  db: Db,
  shop: string,
  certificate: CertificateWrite,
  options: { createdAt?: Date } = {},
): Promise<{ id: string; code: string; version: number }> {
  const createdAt = options.createdAt ?? new Date();

  return db.certificate.create({
    data: {
      shop,
      ...writeColumns(certificate),
      ...derivedColumns(certificate),
      createdAt,
      updatedAt: createdAt,
      signers: { create: signerRows(certificate) },
    },
    select: REFERENCE_SELECT,
  });
}

export async function updateCertificateRow(
  transaction: Transaction,
  shop: string,
  id: string,
  certificate: CertificateWrite,
): Promise<{
  id: string;
  code: string;
  version: number;
  previousCode: string;
}> {
  // Lock the row before anything else: an overlapping save waits here, then sees the other
  // save's committed code and signers, so the last save wins whole.
  const [previous] = await transaction.certificate.updateManyAndReturn({
    where: { id, shop },
    data: { version: { increment: 1 } },
    select: { code: true },
  });

  if (!previous) {
    throw new Prisma.PrismaClientKnownRequestError("Certificate not found.", {
      code: "P2025",
      clientVersion: Prisma.prismaVersion.client,
    });
  }

  await transaction.signer.deleteMany({ where: { certificateId: id } });
  const updated = await transaction.certificate.update({
    where: { id },
    data: {
      ...writeColumns(certificate),
      ...derivedColumns(certificate),
      photoError: null,
      videoError: null,
      updatedAt: new Date(),
      signers: { create: signerRows(certificate) },
    },
    select: REFERENCE_SELECT,
  });

  return { ...updated, previousCode: previous.code };
}

// Bookkeeping only: updatedAt stays the merchant's last edit.
export async function patchSystemFields(
  db: Db,
  shop: string,
  id: string,
  patch: SystemPatch,
): Promise<{ version: number } | null> {
  const [row] = await db.certificate.updateManyAndReturn({
    where: { id, shop },
    data: { ...patch, version: { increment: 1 } },
    select: { version: true },
  });

  return row ?? null;
}

export async function deleteCertificateRows(
  db: Db,
  shop: string,
  ids: string[],
): Promise<{ id: string; code: string; version: number }[]> {
  if (ids.length === 0) {
    return [];
  }

  // One statement locks and reads each row: a code change that commits first is what RETURNING
  // sees, so the DELETE intent gets the current handle. Signers go by ON DELETE CASCADE.
  const rows = await db.$queryRaw<
    { id: string; code: string; version: number }[]
  >`DELETE FROM certificates WHERE shop = ${shop} AND id = ANY(${ids}::uuid[]) RETURNING id, code, version`;

  return rows.sort((left, right) => left.id.localeCompare(right.id));
}

// One REPEATABLE READ transaction, so the certificate and its queue row are a consistent pair.
export async function getMirrorSnapshot(
  shop: string,
  id: string,
): Promise<{ certificate: MirrorSource | null; row: SyncFailureRow | null }> {
  return runTransaction(
    async (transaction) => {
      const certificate = await transaction.certificate.findFirst({
        where: { id, shop },
        select: RECORD_SELECT,
      });
      const row = await transaction.syncFailure.findFirst({
        where: { certificateId: id, shop },
      });

      return { certificate: certificate ? toRecord(certificate) : null, row };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

export async function currentVersion(
  shop: string,
  id: string,
): Promise<number | null> {
  const certificate = await prisma.certificate.findFirst({
    where: { id, shop },
    select: { version: true },
  });

  return certificate?.version ?? null;
}

export function countCertificates(shop: string): Promise<number> {
  return prisma.certificate.count({ where: { shop } });
}
