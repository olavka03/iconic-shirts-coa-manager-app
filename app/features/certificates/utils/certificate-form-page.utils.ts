import type {
  CertificateFormProps,
  Draft,
  FormState,
} from "~/features/certificates/types/certificate-form.types";
import { MEDIA_KINDS } from "~/features/media/utils/media.utils";
import { pendingFileIdOfValue } from "~/features/media/utils/media-field-view.utils";
import type { CertificateDetail } from "~/features/certificates/types/certificates.types";
import type { MediaKind } from "~/features/media/types/media.types";
import { createFormState } from "./certificate-form-draft.utils";

export type MediaBusy = Record<MediaKind, boolean>;
export type MediaErrors = CertificateDetail["mediaErrors"];

export const NOT_BUSY: MediaBusy = { photo: false, video: false };

export function createInitialState(props: CertificateFormProps): FormState {
  const shared = {
    codePrefix: props.codePrefix,
    dictionary: props.codeDictionary,
  };

  if (props.kind === "edit") {
    return createFormState({
      ...shared,
      kind: "edit",
      values: props.certificate.values,
      certificateId: props.certificate.id,
      orderCard: props.certificate.orderCard,
      orderCertificates: props.certificate.orderCertificates,
    });
  }

  return createFormState({
    ...shared,
    kind: props.kind,
    values: props.initial,
    certificateId: null,
  });
}

export function pageHeading(state: FormState): string {
  return state.kind === "edit" && state.savedCode !== null
    ? state.savedCode
    : "New certificate";
}

export function discardTarget(
  props: CertificateFormProps,
  lastIndexHref: string,
): string | null {
  switch (props.kind) {
    case "edit":
      return null;
    case "duplicate":
      return `/app/certificates/${props.duplicateOf.id}`;
    case "create":
      return lastIndexHref;
  }
}

// A file that is already in the draft is covered by the dirty check; an upload still running isn't yet.
export function hasUploadOutsideDraft(busy: MediaBusy, draft: Draft): boolean {
  return MEDIA_KINDS.some(
    (kind) => busy[kind] && pendingFileIdOfValue(draft[kind]) === null,
  );
}
