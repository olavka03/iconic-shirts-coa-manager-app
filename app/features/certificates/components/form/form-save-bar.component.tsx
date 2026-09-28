import { SaveBar } from "@shopify/app-bridge-react";
import { useLayoutEffect } from "react";
import { SAVE_BAR_ID } from "~/features/certificates/constants/certificate-form.constants";

// App Bridge finds the bar by id, so it has to be hidden while the form is still mounted.
export async function hideFormSaveBar(): Promise<void> {
  try {
    await shopify.saveBar.hide(SAVE_BAR_ID);
  } catch {
    // A bar that is already gone needs no hiding; leaving the page must still go ahead.
  }
}

type FormSaveBarProps = {
  open: boolean;
  saving: boolean;
  saveBlocked: boolean;
  onSave(): void;
  onDiscard(): void;
};

export function FormSaveBar({
  open,
  saving,
  saveBlocked,
  onSave,
  onDiscard,
}: FormSaveBarProps) {
  useLayoutEffect(() => () => void hideFormSaveBar(), []);

  return (
    <SaveBar id={SAVE_BAR_ID} open={open} discardConfirmation>
      <button
        variant="primary"
        loading={saving ? "" : undefined}
        disabled={saveBlocked || saving}
        onClick={onSave}
      >
        Save
      </button>
      <button disabled={saving} onClick={onDiscard}>
        Discard
      </button>
    </SaveBar>
  );
}
