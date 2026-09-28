import type {
  FormAction,
  FormState,
} from "~/features/certificates/types/certificate-form.types";
import { withDraft } from "~/features/certificates/utils/certificate-form-draft.utils";
import { withoutKeys } from "~/features/certificates/utils/certificate-form-errors.utils";
import { codeSuggestion } from "~/features/certificates/utils/certificate-form-selectors.utils";
import { normalizeCode } from "~/features/codes/utils/code.utils";

type AutoCodeRejectedAction = Extract<FormAction, { type: "autoCodeRejected" }>;

export function withCode(state: FormState, code: string): FormState {
  if (code === state.draft.code) {
    return state;
  }

  return {
    ...withDraft(state, { code }),
    errors: withoutKeys(state.errors, ["code"]),
  };
}

export function recomputeAutoCode(state: FormState): FormState {
  if (state.kind === "edit" || state.codeMode !== "auto") {
    return state;
  }

  const { natural, value } = codeSuggestion(state);

  return natural ? withCode(state, value ?? natural.code) : state;
}

export function setCode(state: FormState, value: string): FormState {
  return {
    ...withCode(state, normalizeCode(value)),
    codeMode: state.kind === "edit" ? state.codeMode : "manual",
    errors: withoutKeys(state.errors, ["code"]),
  };
}

export function applyCodeBlur(state: FormState): FormState {
  if (state.kind === "edit" || state.draft.code !== "") {
    return state;
  }

  return recomputeAutoCode({ ...state, codeMode: "auto" });
}

export function applySuggestedCode(state: FormState): FormState {
  if (state.kind !== "edit") {
    return recomputeAutoCode({ ...state, codeMode: "auto" });
  }

  const { value } = codeSuggestion(state);

  return value === null ? state : withCode(state, value);
}

export function applyCodeTaken(state: FormState, code: string): FormState {
  if (state.draft.codesTakenLive.includes(code)) {
    return state;
  }

  return recomputeAutoCode(
    withDraft(state, { codesTakenLive: [...state.draft.codesTakenLive, code] }),
  );
}

export function applyAutoCodeRejected(
  state: FormState,
  action: AutoCodeRejectedAction,
): FormState {
  if (state.autoRetried) {
    return {
      ...state,
      codeMode: "manual",
      errors: { ...state.errors, code: action.message },
    };
  }

  const taken =
    action.takenCodes === null
      ? { codesTakenLive: [...state.draft.codesTakenLive, action.rejected] }
      : { takenCodes: action.takenCodes };

  return { ...recomputeAutoCode(withDraft(state, taken)), autoRetried: true };
}
