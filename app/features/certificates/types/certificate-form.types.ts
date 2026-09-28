import type { Dispatch } from "react";
import type { input as ZodInput } from "zod";
import type { CertificateInputSchema } from "~/features/certificates/schemas/certificate.schema";
import type {
  CodeSuggestion,
  TeamDictionary,
} from "~/features/codes/types/code-generator.types";
import type { MediaKind, MediaValue } from "~/features/media/types/media.types";
import type {
  LineItemValue,
  OrderCard,
  OrderCertificateReference,
  OrderDetail,
  OrderItemRow,
  OrderRow,
  OrderValue,
} from "~/features/orders/types/orders.types";
import type { FieldErrors } from "~/shared/types/api.types";
import type {
  CertificateDetail,
  CertificateFormValues,
  ProductValue,
} from "./certificates.types";

export type FormKind = "create" | "duplicate" | "edit";
// iso "" is no date; view seeds the calendar month (YYYY-MM); month is "01".."12" or "".
export type DateDraft =
  | { dayUnknown: false; iso: string; view: string | null }
  | { dayUnknown: true; month: string; year: string };
export type DateAndLocation = { date: DateDraft; location: string };
export type DateAndLocationTarget =
  { scope: "shared" } | { scope: "signer"; signerKey: string };
export type SignerDraft = { key: string; name: string; own: DateAndLocation };
export type SignerMode = "one" | "shared" | "separate";
export type FillKey =
  "item" | "product" | "product-removed" | "signer" | "signers" | "code";
export type Draft = {
  code: string;
  item: string;
  notes: string;
  order: OrderValue | null;
  lineItem: LineItemValue | null;
  orderCard: OrderCard | null;
  orderCertificates: OrderCertificateReference[];
  takenCodes: string[];
  codesTakenLive: string[];
  product: ProductValue | null;
  photo: MediaValue | null;
  video: MediaValue | null;
  signers: SignerDraft[];
  sharedOn: boolean;
  shared: DateAndLocation;
  sharedBaseline: DateAndLocation | null;
  filled: FillKey[];
  touched: { item: boolean; product: boolean };
  derivedItem: string | null;
  derivedProductId: string | null;
  signerHint: string[] | null;
  signerWarningDismissed: boolean;
  pickedInDraft: boolean;
};
export type FormState = {
  kind: FormKind;
  certificateId: string | null;
  savedCode: string | null;
  codePrefix: string;
  dictionary: TeamDictionary;
  baseline: Draft;
  draft: Draft;
  codeMode: "auto" | "manual";
  errors: FieldErrors;
  attemptedSave: boolean;
  autoRetried: boolean;
  nextKey: number;
};
export type LinkedProductPick = {
  id: string;
  title: string;
  imageUrl: string | null;
  status: ProductValue["status"];
};
export type FormAction =
  | { type: "setCode"; value: string }
  | { type: "codeBlur" }
  | { type: "acceptSuggestedCode" }
  | { type: "restoreOldCode" }
  | { type: "applyAutoCode" }
  | { type: "codeTaken"; code: string }
  | { type: "setItem"; value: string }
  | { type: "setNotes"; value: string }
  | { type: "linkProduct"; product: LinkedProductPick }
  | { type: "removeProduct" }
  | { type: "pick"; order: OrderRow; item: OrderItemRow; detail: OrderDetail }
  | { type: "setSignerName"; key: string; value: string }
  | { type: "setDate"; target: DateAndLocationTarget; value: DateDraft }
  | { type: "setLocation"; target: DateAndLocationTarget; value: string }
  | { type: "addSigner" }
  | { type: "removeSigner"; key: string }
  | { type: "moveSigner"; key: string; delta: -1 | 1 }
  | { type: "setSharedOn"; on: boolean }
  | { type: "acceptHintName" }
  | { type: "dismissSignerWarning" }
  | { type: "setMedia"; kind: MediaKind; value: MediaValue | null }
  | { type: "validate" }
  | { type: "serverErrors"; errors: FieldErrors }
  | {
      type: "autoCodeRejected";
      takenCodes: string[] | null;
      rejected: string;
      message: string;
    }
  | { type: "saved"; detail: CertificateDetail; sentProjection: string }
  | { type: "mediaCompleted"; detail: CertificateDetail }
  | { type: "discard" };
export type CertificateFormInput = ZodInput<typeof CertificateInputSchema>;
export type CodeCollision = "none" | "season" | "dash" | "exhausted";
export type CodeSuggestionState = {
  natural: CodeSuggestion | null;
  value: string | null;
  collision: CodeCollision;
};

export type SectionProps = {
  state: FormState;
  dispatch: Dispatch<FormAction>;
};

export type FocusTarget = "name" | "menu";

export type SignerFocus = {
  register(
    target: FocusTarget,
    key: string,
  ): (element: HTMLElement | null) => () => void;
  focusAfterUpdate(
    target: FocusTarget,
    pickKey: (keys: string[]) => string | undefined,
  ): void;
};

export type CertificateFormProps =
  | {
      kind: "create";
      initial: CertificateFormValues;
      codeDictionary: TeamDictionary;
      codePrefix: string;
      duplicateMissing: boolean;
    }
  | {
      kind: "duplicate";
      initial: CertificateFormValues;
      codeDictionary: TeamDictionary;
      codePrefix: string;
      duplicateOf: { id: string; code: string };
    }
  | {
      kind: "edit";
      certificate: CertificateDetail;
      codeDictionary: TeamDictionary;
      codePrefix: string;
    };
