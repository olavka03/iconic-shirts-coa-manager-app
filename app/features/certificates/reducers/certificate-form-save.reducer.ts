import type { FormState } from "~/features/certificates/types/certificate-form.types";
import {
  savedDraft,
  signerKeys,
} from "~/features/certificates/utils/certificate-form-draft.utils";
import { toDraftErrors } from "~/features/certificates/utils/certificate-form-errors.utils";
import {
  projection,
  toInput,
} from "~/features/certificates/utils/certificate-form-input.utils";
import type { CertificateDetail } from "~/features/certificates/types/certificates.types";
import type { MediaValue } from "~/features/media/types/media.types";
import type { FieldErrors } from "~/shared/types/api.types";

function sameFile(
  first: MediaValue | null,
  second: MediaValue | null,
): boolean {
  return (
    first?.source === "file" &&
    second?.source === "file" &&
    first.fileId === second.fileId
  );
}

export function applyServerErrors(
  state: FormState,
  errors: FieldErrors,
): FormState {
  const mapped = toDraftErrors(errors, state.draft, toInput(state).rowKeys);
  // An auto code never shows an error, so the merchant takes over the code the server rejected.
  const codeRejected = Object.hasOwn(mapped, "code");

  return {
    ...state,
    errors: mapped,
    attemptedSave: true,
    codeMode: codeRejected ? "manual" : state.codeMode,
  };
}

export function applyMediaCompleted(
  state: FormState,
  detail: CertificateDetail,
): FormState {
  const { photo, video } = detail.values;
  const follow = (
    current: MediaValue | null,
    before: MediaValue | null,
    after: MediaValue | null,
  ) => (sameFile(current, before) ? after : current);

  return {
    ...state,
    baseline: { ...state.baseline, photo, video },
    draft: {
      ...state.draft,
      photo: follow(state.draft.photo, state.baseline.photo, photo),
      video: follow(state.draft.video, state.baseline.video, video),
    },
  };
}

export function applySaved(
  state: FormState,
  detail: CertificateDetail,
  sentProjection: string,
): FormState {
  const unchanged = projection(state.draft) === sentProjection;
  const count = Math.max(detail.values.signers.length, 1);
  const { rowKeys } = toInput(state);
  const reuseKeys = unchanged && rowKeys.length === count;
  // Keeps the signers in the mode the merchant used instead of re-deriving it from the values.
  const preferShared = unchanged ? state.draft.sharedOn : true;
  const baseline = savedDraft(
    detail.values,
    reuseKeys ? rowKeys : signerKeys(state.nextKey, count),
    state.dictionary,
    { card: detail.orderCard, certificates: detail.orderCertificates },
    preferShared,
  );

  return {
    ...state,
    baseline,
    draft: unchanged
      ? baseline
      : { ...state.draft, filled: [], signerHint: null, codesTakenLive: [] },
    savedCode: detail.values.code,
    errors: {},
    attemptedSave: false,
    autoRetried: false,
    nextKey: reuseKeys ? state.nextKey : state.nextKey + count,
  };
}

export function discard(state: FormState): FormState {
  return {
    ...state,
    draft: state.baseline,
    codeMode: state.kind === "edit" ? "manual" : "auto",
    errors: {},
    attemptedSave: false,
    autoRetried: false,
  };
}
