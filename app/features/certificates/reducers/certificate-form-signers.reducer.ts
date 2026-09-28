import { SIGNERS_MAX } from "~/features/certificates/constants/certificate-limits.constants";
import type {
  DateAndLocation,
  DateAndLocationTarget,
  Draft,
  FormState,
  SignerDraft,
} from "~/features/certificates/types/certificate-form.types";
import {
  sameDateAndLocation,
  signerMode,
  signerRowKey,
  withDraft,
} from "~/features/certificates/utils/certificate-form-draft.utils";

export function updateSigner(
  state: FormState,
  key: string,
  change: (signer: SignerDraft) => SignerDraft,
): FormState {
  return withDraft(state, {
    signers: state.draft.signers.map((signer) =>
      signer.key === key ? change(signer) : signer,
    ),
  });
}

export function updateDateAndLocation(
  state: FormState,
  target: DateAndLocationTarget,
  change: (value: DateAndLocation) => DateAndLocation,
): FormState {
  if (target.scope === "shared") {
    return withDraft(state, { shared: change(state.draft.shared) });
  }

  return updateSigner(state, target.signerKey, (signer) => ({
    ...signer,
    own: change(signer.own),
  }));
}

export function addSigner(state: FormState): FormState {
  const { draft } = state;

  if (draft.signers.length >= SIGNERS_MAX) {
    return state;
  }

  const mode = signerMode(draft);
  const entered: Draft =
    mode === "one"
      ? {
          ...draft,
          sharedOn: true,
          shared: draft.signers[0].own,
          sharedBaseline: draft.signers[0].own,
        }
      : draft;
  const own =
    mode === "separate"
      ? draft.signers[draft.signers.length - 1].own
      : entered.shared;

  return {
    ...state,
    nextKey: state.nextKey + 1,
    draft: {
      ...entered,
      signers: [
        ...entered.signers,
        { key: signerRowKey(state.nextKey), name: "", own },
      ],
    },
  };
}

export function removeSigner(state: FormState, key: string): FormState {
  const { draft } = state;
  const signers = draft.signers.filter((signer) => signer.key !== key);

  if (signers.length === 0 || signers.length === draft.signers.length) {
    return state;
  }

  if (signers.length > 1) {
    return withDraft(state, { signers });
  }

  const [last] = signers;

  return withDraft(state, {
    signers: [draft.sharedOn ? { ...last, own: draft.shared } : last],
    sharedOn: false,
    sharedBaseline: null,
  });
}

export function moveSigner(
  state: FormState,
  key: string,
  delta: -1 | 1,
): FormState {
  const signers = [...state.draft.signers];
  const from = signers.findIndex((signer) => signer.key === key);
  const to = from + delta;

  if (from === -1 || to < 0 || to >= signers.length) {
    return state;
  }

  [signers[from], signers[to]] = [signers[to], signers[from]];

  return withDraft(state, { signers });
}

export function setSharedOn(state: FormState, on: boolean): FormState {
  const { draft } = state;

  if (draft.signers.length < 2 || on === draft.sharedOn) {
    return state;
  }

  if (on) {
    const shared = draft.signers[0].own;

    return withDraft(state, { sharedOn: true, shared, sharedBaseline: shared });
  }

  const unchanged =
    draft.sharedBaseline !== null &&
    sameDateAndLocation(draft.shared, draft.sharedBaseline);

  return withDraft(state, {
    sharedOn: false,
    sharedBaseline: null,
    signers: unchanged
      ? draft.signers
      : draft.signers.map((signer) => ({ ...signer, own: draft.shared })),
  });
}

export function applyHintName(state: FormState): FormState {
  const hint = state.draft.signerHint;

  if (hint?.length !== 1) {
    return state;
  }

  return updateSigner(state, state.draft.signers[0].key, (signer) => ({
    ...signer,
    name: hint[0],
  }));
}

export function withSignerNames(state: FormState, names: string[]): FormState {
  const withRows = names
    .slice(state.draft.signers.length)
    .reduce((current) => addSigner(current), state);

  return withDraft(withRows, {
    signers: withRows.draft.signers.map((signer, index) =>
      index < names.length ? { ...signer, name: names[index] } : signer,
    ),
  });
}
