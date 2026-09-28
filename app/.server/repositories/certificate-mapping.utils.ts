import type { Prisma } from "@prisma/client";
import type { Presence } from "~/features/certificates/utils/list-params.utils";
import { buildSearchText } from "~/features/certificates/utils/search-text.utils";
import type { MediaKind } from "~/features/media/types/media.types";
import type { SignerLike } from "~/features/signers/utils/signer-text.utils";
import {
  fromDbDate,
  sortKey,
  toDbDate,
} from "~/shared/utils/signing-date.utils";
import type { CertificateRecord, CertificateWrite } from "./certificate.types";

export const SIGNERS = {
  orderBy: { position: "asc" },
  select: { name: true, signedOn: true, datePrecision: true, location: true },
} as const;

export const SIGNER_NAMES = {
  orderBy: { position: "asc" },
  select: { name: true },
} as const;

export const RECORD_SELECT = {
  id: true,
  shop: true,
  code: true,
  item: true,
  notes: true,
  orderId: true,
  orderName: true,
  lineItemId: true,
  lineItemTitle: true,
  photoUrl: true,
  photoFileId: true,
  videoUrl: true,
  videoFileId: true,
  videoPreviewUrl: true,
  photoError: true,
  videoError: true,
  productId: true,
  productTitle: true,
  productImageUrl: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  signers: SIGNERS,
} satisfies Prisma.CertificateSelect;

export const REFERENCE_SELECT = {
  id: true,
  code: true,
  version: true,
} as const;

type SignerRow = {
  name: string;
  signedOn: Date | null;
  datePrecision: "DAY" | "MONTH" | null;
  location: string | null;
};

export const toSigner = (signer: SignerRow): SignerLike => ({
  name: signer.name,
  date:
    signer.signedOn && signer.datePrecision
      ? fromDbDate(signer.signedOn, signer.datePrecision)
      : null,
  location: signer.location,
});

export function toRecord(
  certificate: Prisma.CertificateGetPayload<{ select: typeof RECORD_SELECT }>,
): CertificateRecord {
  return { ...certificate, signers: certificate.signers.map(toSigner) };
}

export const excluding = (id?: string) =>
  id === undefined ? {} : { NOT: { id } };

// Written with the content in one statement, so the derived columns can't drift from it.
export function derivedColumns(certificate: CertificateWrite) {
  const latest =
    certificate.signers
      .flatMap((signer) => (signer.date ? [sortKey(signer.date)] : []))
      .sort()
      .at(-1) ?? null;

  return {
    searchText: buildSearchText({
      code: certificate.code,
      item: certificate.item,
      orderName: certificate.orderName,
      signerNames: certificate.signers.map((signer) => signer.name),
    }),
    latestSignedOn: latest ? new Date(`${latest}T00:00:00Z`) : null,
  };
}

export const signerRows = (certificate: CertificateWrite) =>
  certificate.signers.map((signer, position) => ({
    position,
    name: signer.name,
    signedOn: signer.date ? toDbDate(signer.date) : null,
    datePrecision: signer.date?.precision ?? null,
    location: signer.location,
  }));

// Picks exactly the write columns, so callers may pass a wider object such as a CertificateRecord.
export function writeColumns(certificate: CertificateWrite) {
  return {
    code: certificate.code,
    item: certificate.item,
    notes: certificate.notes,
    orderId: certificate.orderId,
    orderName: certificate.orderName,
    lineItemId: certificate.lineItemId,
    lineItemTitle: certificate.lineItemTitle,
    photoUrl: certificate.photoUrl,
    photoFileId: certificate.photoFileId,
    videoUrl: certificate.videoUrl,
    videoFileId: certificate.videoFileId,
    videoPreviewUrl: certificate.videoPreviewUrl,
    productId: certificate.productId,
    productTitle: certificate.productTitle,
    productImageUrl: certificate.productImageUrl,
  };
}

export function pendingMediaWhere(
  kind: MediaKind,
  fileIds?: string[],
): Prisma.CertificateWhereInput {
  const fileIdFilter = fileIds === undefined ? { not: null } : { in: fileIds };

  return kind === "photo"
    ? { photoFileId: fileIdFilter, photoUrl: null }
    : { videoFileId: fileIdFilter, videoUrl: null };
}

// A file Shopify is still processing counts as present.
export function mediaPresenceWhere(
  kind: MediaKind,
  presence: Presence,
): Prisma.CertificateWhereInput {
  if (kind === "photo") {
    return presence === "yes"
      ? { OR: [{ photoUrl: { not: null } }, { photoFileId: { not: null } }] }
      : { photoUrl: null, photoFileId: null };
  }

  return presence === "yes"
    ? { OR: [{ videoUrl: { not: null } }, { videoFileId: { not: null } }] }
    : { videoUrl: null, videoFileId: null };
}
