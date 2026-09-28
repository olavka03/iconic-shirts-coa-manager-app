import { useEffect, useRef, type Dispatch } from "react";
import type {
  FormAction,
  FormState,
} from "~/features/certificates/types/certificate-form.types";
import { useDebouncedValue } from "~/shared/hooks/use-debounced-value.hook";

const SUGGESTION_DELAY_MS = 300;

// Only what the code is built from; dates, locations, media and notes never change it.
function codeInputs({ draft }: FormState): string {
  const names = draft.signers
    .map((signer) => signer.name.trim())
    .filter((name) => name !== "");

  return JSON.stringify([names, draft.item, draft.product?.id ?? null]);
}

export function useCodeSuggestion(
  state: FormState,
  dispatch: Dispatch<FormAction>,
): void {
  const settledInputs = useDebouncedValue(
    codeInputs(state),
    SUGGESTION_DELAY_MS,
  );
  const appliedInputs = useRef(settledInputs);
  const autoCode = state.kind !== "edit" && state.codeMode === "auto";

  useEffect(() => {
    if (settledInputs === appliedInputs.current) {
      return;
    }

    appliedInputs.current = settledInputs;

    if (autoCode) {
      dispatch({ type: "applyAutoCode" });
    }
  }, [settledInputs, autoCode, dispatch]);
}
