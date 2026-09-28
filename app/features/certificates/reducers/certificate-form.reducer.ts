import type {
  FormAction,
  FormState,
} from "~/features/certificates/types/certificate-form.types";
import { withDraft } from "~/features/certificates/utils/certificate-form-draft.utils";
import {
  clientErrors,
  revalidated,
} from "~/features/certificates/utils/certificate-form-errors.utils";
import {
  applyAutoCodeRejected,
  applyCodeBlur,
  applyCodeTaken,
  applySuggestedCode,
  recomputeAutoCode,
  setCode,
  withCode,
} from "./certificate-form-code.reducer";
import { applyPick, linkProduct } from "./certificate-form-pick.reducer";
import {
  applyMediaCompleted,
  applySaved,
  applyServerErrors,
  discard,
} from "./certificate-form-save.reducer";
import {
  addSigner,
  applyHintName,
  moveSigner,
  removeSigner,
  setSharedOn,
  updateDateAndLocation,
  updateSigner,
} from "./certificate-form-signers.reducer";

function applyAction(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "setCode":
      return setCode(state, action.value);
    case "codeBlur":
      return applyCodeBlur(state);
    case "acceptSuggestedCode":
      return applySuggestedCode(state);
    case "restoreOldCode":
      return withCode(state, state.savedCode ?? state.draft.code);
    case "applyAutoCode":
      return recomputeAutoCode(state);
    case "codeTaken":
      return applyCodeTaken(state, action.code);
    case "setItem":
      return withDraft(state, {
        item: action.value,
        touched: { ...state.draft.touched, item: true },
      });
    case "setNotes":
      return withDraft(state, { notes: action.value });
    case "linkProduct":
      return linkProduct(state, action.product);
    case "removeProduct":
      return withDraft(state, {
        product: null,
        touched: { ...state.draft.touched, product: true },
      });
    case "pick":
      return applyPick(state, action);
    case "setSignerName":
      return updateSigner(state, action.key, (signer) => ({
        ...signer,
        name: action.value,
      }));
    case "setDate":
      return updateDateAndLocation(state, action.target, (current) => ({
        ...current,
        date: action.value,
      }));
    case "setLocation":
      return updateDateAndLocation(state, action.target, (current) => ({
        ...current,
        location: action.value,
      }));
    case "addSigner":
      return addSigner(state);
    case "removeSigner":
      return removeSigner(state, action.key);
    case "moveSigner":
      return moveSigner(state, action.key, action.delta);
    case "setSharedOn":
      return setSharedOn(state, action.on);
    case "acceptHintName":
      return applyHintName(state);
    case "dismissSignerWarning":
      return withDraft(state, { signerWarningDismissed: true });
    case "setMedia":
      return withDraft(
        state,
        action.kind === "photo"
          ? { photo: action.value }
          : { video: action.value },
      );
    case "validate":
      return { ...state, errors: clientErrors(state), attemptedSave: true };
    case "serverErrors":
      return applyServerErrors(state, action.errors);
    case "autoCodeRejected":
      return applyAutoCodeRejected(state, action);
    case "saved":
      return applySaved(state, action.detail, action.sentProjection);
    case "mediaCompleted":
      return applyMediaCompleted(state, action.detail);
    case "discard":
      return discard(state);
  }
}

export function formReducer(state: FormState, action: FormAction): FormState {
  const next = applyAction(state, action);

  if (!next.attemptedSave || next.draft === state.draft) {
    return next;
  }

  return { ...next, errors: revalidated(state.draft, next) };
}
