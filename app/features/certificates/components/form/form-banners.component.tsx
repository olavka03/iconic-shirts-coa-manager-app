import { useFocusOncePerFailedSave } from "~/features/certificates/hooks/use-form-focus.hook";
import type { SaveFailure } from "~/features/certificates/hooks/use-certificate-save.hook";
import type {
  Draft,
  FormState,
} from "~/features/certificates/types/certificate-form.types";
import type { MediaErrors } from "~/features/certificates/utils/certificate-form-page.utils";
import { orderedErrors } from "~/features/certificates/utils/field-labels.utils";
import type { MediaKind } from "~/features/media/types/media.types";
import { MEDIA_KINDS } from "~/features/media/utils/media.utils";
import { ErrorSummary } from "./error-summary.component";

const MEDIA_FAILURE_HEADINGS: Record<MediaKind | "both", string> = {
  photo: "The proof photo couldn't be processed",
  video: "The proof video couldn't be processed",
  both: "The proof photo and video couldn't be processed",
};
const SAVE_FAILURE_TEXT: Record<SaveFailure, string> = {
  unavailable: "Check your connection and try again.",
  not_found: "It may have been deleted.",
};

type FormStatusBannerProps = {
  state: FormState;
  failedSaves: number;
  failure: SaveFailure | null;
  duplicateMissing: boolean;
};

export function FormStatusBanner({
  state,
  failedSaves,
  failure,
  duplicateMissing,
}: FormStatusBannerProps) {
  const focusFirstError = useFocusOncePerFailedSave(failedSaves);

  if (state.attemptedSave && orderedErrors(state.errors).length > 0) {
    return (
      <ErrorSummary
        key={failedSaves}
        errors={state.errors}
        onFocusField={(key) => focusFirstError(key, state.draft)}
      />
    );
  }

  if (failure !== null) {
    return (
      <s-banner
        slot="supplemental-start"
        tone="critical"
        heading="This certificate couldn't be saved"
      >
        <s-paragraph>{SAVE_FAILURE_TEXT[failure]}</s-paragraph>
      </s-banner>
    );
  }

  return duplicateMissing ? (
    <s-banner slot="supplemental-start" tone="info">
      The certificate you tried to duplicate no longer exists.
    </s-banner>
  ) : null;
}

export function MediaFailureBanner({
  mediaErrors,
  draft,
}: {
  mediaErrors: MediaErrors;
  draft: Draft;
}) {
  const failed = MEDIA_KINDS.filter(
    (kind) => mediaErrors[kind] !== null && draft[kind] === null,
  );

  if (failed.length === 0) {
    return null;
  }

  const reasons = [
    ...new Set(failed.flatMap((kind) => mediaErrors[kind] ?? [])),
  ];

  return (
    <s-banner
      slot="supplemental-start"
      tone="critical"
      heading={MEDIA_FAILURE_HEADINGS[failed.length > 1 ? "both" : failed[0]]}
    >
      {reasons.map((reason) => (
        <s-paragraph key={reason}>{reason}</s-paragraph>
      ))}
    </s-banner>
  );
}
