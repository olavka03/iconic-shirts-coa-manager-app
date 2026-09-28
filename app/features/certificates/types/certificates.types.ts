import type { MediaValue } from "~/features/media/types/media.types";
import type {
  LineItemValue,
  OrderCard,
  OrderCertificateReference,
  OrderValue,
} from "~/features/orders/types/orders.types";
import type { SignerValue } from "~/features/signers/types/signers.types";
import type {
  CertificateReference,
  ErrorBody,
  ProductStatus,
} from "~/shared/types/api.types";

export type ProductValue = {
  id: string;
  title: string;
  imageUrl: string | null;
  status: ProductStatus | null;
  missing: boolean;
};

export type ProofLabel = "Photo and video" | "Photo only" | "Video only" | "";

export type CertificateListItem = {
  id: string;
  code: string;
  item: string;
  signedBy: string;
  dateLabel: string;
  // Same presence rule as the index filter: a url or a fileId counts.
  proofLabel: ProofLabel;
  mediaFailed: "photo" | "video" | "both" | null;
  // Linked or backfilled.
  orderName: string | null;
  // Stored photoUrl ?? productImageUrl; a processing photo has none.
  imageUrl: string | null;
};

export type CertificateFormValues = {
  code: string;
  item: string;
  notes: string;
  // Both null: no link and no backfilled name.
  order: OrderValue | null;
  lineItem: LineItemValue | null;
  product: ProductValue | null;
  photo: MediaValue | null;
  video: MediaValue | null;
  signers: SignerValue[];
};

export type CertificateDetail = {
  id: string;
  values: CertificateFormValues;
  pendingFileIds: string[];
  // null: legacy, or the order couldn't be read.
  orderCard: OrderCard | null;
  orderCertificates: OrderCertificateReference[];
  mediaErrors: { photo: string | null; video: string | null };
  createdLabel: string;
  updatedLabel: string;
};

export type CreateResponse = { ok: true; id: string; code: string } | ErrorBody;

export type UpdateResponse =
  { ok: true; certificate: CertificateDetail } | ErrorBody;

export type DeleteManyResponse =
  { ok: true; deleted: CertificateReference[] } | ErrorBody;

export type DeleteOneResponse = { ok: true } | ErrorBody;
