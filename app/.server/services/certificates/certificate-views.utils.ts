import type { ProductSnapshot } from "~/.server/gateways/products.gateway";
import type {
  CertificateDetail,
  CertificateFormValues,
  CertificateListItem,
  ProductValue,
} from "~/features/certificates/types/certificates.types";
import type { MediaValue } from "~/features/media/types/media.types";
import type {
  OrderCard,
  OrderCertificateReference,
} from "~/features/orders/types/orders.types";
import { formatTimestampDay } from "~/shared/utils/format.utils";
import {
  hasStoredMedia,
  mediaErrorMessage,
  pendingFileIds,
} from "~/features/media/utils/media.utils";
import { proofLabel } from "~/features/certificates/utils/proof-label.utils";
import {
  dateSignedLabel,
  signerSummary,
} from "~/features/signers/utils/signer-text.utils";
import type {
  CertificateRecord,
  ListRow,
} from "~/.server/repositories/certificate.types";

function mediaFailed(
  photoError: string | null,
  videoError: string | null,
): CertificateListItem["mediaFailed"] {
  if (photoError !== null && videoError !== null) {
    return "both";
  }

  if (photoError !== null) {
    return "photo";
  }

  return videoError !== null ? "video" : null;
}

export function toListItem(row: ListRow): CertificateListItem {
  return {
    id: row.id,
    code: row.code,
    item: row.item,
    signedBy: signerSummary(row.signers.map((signer) => signer.name)),
    dateLabel: dateSignedLabel(row.signers),
    proofLabel: proofLabel(
      hasStoredMedia(row, "photo"),
      hasStoredMedia(row, "video"),
    ),
    mediaFailed: mediaFailed(row.photoError, row.videoError),
    orderName: row.orderName,
    imageUrl: row.photoUrl ?? row.productImageUrl,
  };
}

function mediaValue(
  fileId: string | null,
  url: string | null,
  previewUrl: string | null,
): MediaValue | null {
  if (fileId !== null) {
    return { source: "file", fileId, url, previewUrl };
  }

  return url === null ? null : { source: "url", url };
}

export function productValue(
  stored: {
    productId: string | null;
    productTitle: string | null;
    productImageUrl: string | null;
  },
  liveProduct: ProductSnapshot | null | "error",
): ProductValue | null {
  if (stored.productId === null) {
    return null;
  }

  if (liveProduct === "error") {
    return {
      id: stored.productId,
      title: stored.productTitle ?? "",
      imageUrl: stored.productImageUrl,
      status: null,
      missing: false,
    };
  }

  if (liveProduct === null) {
    return {
      id: stored.productId,
      title: stored.productTitle ?? "",
      imageUrl: null,
      status: null,
      missing: true,
    };
  }

  return {
    id: liveProduct.id,
    title: liveProduct.title,
    imageUrl: liveProduct.imageUrl,
    status: liveProduct.status,
    missing: false,
  };
}

export function toFormValues(
  certificate: CertificateRecord,
  product: ProductValue | null,
): CertificateFormValues {
  return {
    code: certificate.code,
    item: certificate.item,
    notes: certificate.notes,
    order:
      certificate.orderId !== null || certificate.orderName !== null
        ? { id: certificate.orderId, name: certificate.orderName }
        : null,
    lineItem:
      certificate.lineItemId !== null
        ? { id: certificate.lineItemId, title: certificate.lineItemTitle ?? "" }
        : null,
    product,
    photo: mediaValue(certificate.photoFileId, certificate.photoUrl, null),
    video: mediaValue(
      certificate.videoFileId,
      certificate.videoUrl,
      certificate.videoPreviewUrl,
    ),
    signers: certificate.signers.map((signer) => ({
      name: signer.name,
      date: signer.date,
      location: signer.location ?? "",
    })),
  };
}

function mediaErrorOf(code: string | null): string | null {
  return code === null ? null : mediaErrorMessage(code);
}

export function toCertificateDetail(
  certificate: CertificateRecord,
  details: {
    product: ProductValue | null;
    orderCard: OrderCard | null;
    orderCertificates: OrderCertificateReference[];
    timeZone: string;
  },
): CertificateDetail {
  const dayLabel = (date: Date) =>
    formatTimestampDay(date.toISOString(), details.timeZone);

  return {
    id: certificate.id,
    values: toFormValues(certificate, details.product),
    pendingFileIds: pendingFileIds(certificate),
    orderCard: details.orderCard,
    orderCertificates: details.orderCertificates,
    mediaErrors: {
      photo: mediaErrorOf(certificate.photoError),
      video: mediaErrorOf(certificate.videoError),
    },
    createdLabel: dayLabel(certificate.createdAt),
    updatedLabel: dayLabel(certificate.updatedAt),
  };
}
