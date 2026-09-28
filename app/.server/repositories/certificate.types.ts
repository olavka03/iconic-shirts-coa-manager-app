import type { CodeHistoryItem } from "~/features/codes/types/code-generator.types";
import type { SignerLike } from "~/features/signers/utils/signer-text.utils";

export type CertificateWrite = {
  code: string;
  item: string;
  notes: string;
  orderId: string | null;
  orderName: string | null;
  lineItemId: string | null;
  lineItemTitle: string | null;
  photoUrl: string | null;
  photoFileId: string | null;
  videoUrl: string | null;
  videoFileId: string | null;
  videoPreviewUrl: string | null;
  productId: string | null;
  productTitle: string | null;
  productImageUrl: string | null;
  signers: SignerLike[];
};

export type CertificateRecord = {
  id: string;
  shop: string;
  code: string;
  item: string;
  notes: string;
  orderId: string | null;
  orderName: string | null;
  lineItemId: string | null;
  lineItemTitle: string | null;
  photoUrl: string | null;
  photoFileId: string | null;
  videoUrl: string | null;
  videoFileId: string | null;
  videoPreviewUrl: string | null;
  photoError: string | null;
  videoError: string | null;
  productId: string | null;
  productTitle: string | null;
  productImageUrl: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  signers: SignerLike[];
};

export type MirrorSource = CertificateRecord;

export type ListRow = Pick<
  CertificateRecord,
  | "id"
  | "code"
  | "item"
  | "orderName"
  | "photoUrl"
  | "photoFileId"
  | "videoUrl"
  | "videoFileId"
  | "photoError"
  | "videoError"
  | "productImageUrl"
  | "signers"
>;

export type CodeHistoryRow = Required<CodeHistoryItem>;

export type SystemPatch = Partial<
  Pick<
    CertificateRecord,
    | "photoUrl"
    | "photoFileId"
    | "videoUrl"
    | "videoFileId"
    | "videoPreviewUrl"
    | "photoError"
    | "videoError"
    | "productId"
    | "productTitle"
    | "productImageUrl"
  >
>;

export type PendingRow = {
  id: string;
  code: string;
  photoFileId: string | null;
  photoUrl: string | null;
  videoFileId: string | null;
  videoUrl: string | null;
};
