import type { Dispatch } from "react";
import type {
  Draft,
  FormAction,
  FormState,
  SignerFocus,
} from "~/features/certificates/types/certificate-form.types";
import { fieldError } from "./field-labels.utils";

export type SignerActions = {
  add(): void;
  remove(index: number): void;
  move(key: string, delta: -1 | 1): void;
};

export type SignerErrors = Record<
  "name" | "date" | "month" | "year" | "location",
  string | undefined
>;

export function signerActions(
  draft: Draft,
  dispatch: Dispatch<FormAction>,
  focus: SignerFocus,
): SignerActions {
  const keysBefore = draft.signers.map((signer) => signer.key);

  return {
    add: () => {
      dispatch({ type: "addSigner" });
      focus.focusAfterUpdate("name", (keys) =>
        keys.find((key) => !keysBefore.includes(key)),
      );
    },
    remove: (index) => {
      const neighbour = draft.signers[index + 1] ?? draft.signers[index - 1];

      dispatch({ type: "removeSigner", key: draft.signers[index].key });
      focus.focusAfterUpdate("name", () => neighbour?.key);
    },
    move: (key, delta) => {
      dispatch({ type: "moveSigner", key, delta });
      focus.focusAfterUpdate("menu", () => key);
    },
  };
}

export function signerErrors(state: FormState, index: number): SignerErrors {
  const errorOf = (field: keyof SignerErrors) =>
    fieldError(state.errors, `signers.${index}.${field}`);

  return {
    name: errorOf("name"),
    date: errorOf("date"),
    month: errorOf("month"),
    year: errorOf("year"),
    location: errorOf("location"),
  };
}
