import type {
  CertificateFormInput,
  Draft,
  FormState,
  SignerDraft,
} from "~/features/certificates/types/certificate-form.types";
import { normalizeCode } from "~/features/codes/utils/code.utils";
import type { MediaValue } from "~/features/media/types/media.types";
import {
  isEmptyDateAndLocation,
  signerMode,
  toSigningDate,
} from "./certificate-form-draft.utils";

type SentSigner = {
  key: string;
  value: CertificateFormInput["signers"][number];
};

function sentSigners(draft: Draft): SentSigner[] {
  const shared = signerMode(draft) === "shared";
  const isEmpty = (signer: SignerDraft) =>
    signer.name.trim() === "" && (shared || isEmptyDateAndLocation(signer.own));
  const kept = draft.signers.filter((signer) => !isEmpty(signer));
  const rows = kept.length > 0 ? kept : draft.signers.slice(0, 1);

  return rows.map((signer) => {
    const dateAndLocation = shared ? draft.shared : signer.own;

    return {
      key: signer.key,
      value: {
        name: signer.name.trim(),
        date: toSigningDate(dateAndLocation.date),
        location: dateAndLocation.location.trim() || null,
      },
    };
  });
}

export function mediaInput(
  media: MediaValue | null,
): CertificateFormInput["photo"] {
  if (media === null) {
    return null;
  }

  return media.source === "file"
    ? { source: "file", fileId: media.fileId }
    : { source: "url", url: media.url };
}

function normalizeNotes(notes: string): string {
  return notes.replace(/\r\n?/g, "\n").trim();
}

export function toInput(state: FormState): {
  input: CertificateFormInput;
  rowKeys: string[];
} {
  const { draft } = state;
  const signers = sentSigners(draft);
  const order = draft.order?.id
    ? { id: draft.order.id, name: draft.order.name ?? "" }
    : null;

  return {
    input: {
      code: normalizeCode(draft.code),
      order,
      lineItem:
        order && draft.lineItem
          ? { id: draft.lineItem.id, title: draft.lineItem.title }
          : null,
      item: draft.item.trim(),
      productId: draft.product?.id ?? null,
      productHint: draft.product
        ? { title: draft.product.title, imageUrl: draft.product.imageUrl }
        : null,
      photo: mediaInput(draft.photo),
      video: mediaInput(draft.video),
      notes: normalizeNotes(draft.notes),
      signers: signers.map((signer) => signer.value),
    },
    rowKeys: signers.map((signer) => signer.key),
  };
}

export function projection(draft: Draft): string {
  return JSON.stringify({
    code: normalizeCode(draft.code),
    item: draft.item.trim(),
    notes: normalizeNotes(draft.notes),
    order: draft.order ? [draft.order.id, draft.order.name] : null,
    lineItem: draft.lineItem?.id ?? null,
    product: draft.product?.id ?? null,
    photo: mediaInput(draft.photo),
    video: mediaInput(draft.video),
    signers: sentSigners(draft).map((signer) => signer.value),
  });
}

export function isDirty(state: FormState): boolean {
  return projection(state.draft) !== projection(state.baseline);
}
