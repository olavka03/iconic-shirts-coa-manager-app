import { NOTES_MAX } from "~/features/certificates/constants/certificate-limits.constants";
import type { SectionProps } from "~/features/certificates/types/certificate-form.types";
import { fieldError } from "~/features/certificates/utils/field-labels.utils";

export function NotesSection({ state, dispatch }: SectionProps) {
  return (
    <s-section heading="Notes">
      <s-text-area
        id="certificate-notes"
        label="Notes"
        labelAccessibilityVisibility="exclusive"
        rows={3}
        maxLength={NOTES_MAX}
        details="Shown to customers on the verification page."
        value={state.draft.notes}
        error={fieldError(state.errors, "notes")}
        onInput={(event) =>
          dispatch({ type: "setNotes", value: event.currentTarget.value })
        }
      />
    </s-section>
  );
}
