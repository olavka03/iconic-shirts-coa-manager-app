import type {
  CodeCollision,
  CodeSuggestionState,
  FillKey,
  FormState,
} from "~/features/certificates/types/certificate-form.types";
import type { CodeSuggestion } from "~/features/codes/types/code-generator.types";
import {
  resolveCollision,
  suggestCode,
} from "~/features/codes/utils/code-suggestion.utils";
import { orderToken } from "~/features/orders/utils/orders.utils";
import { joinNames } from "~/features/signers/utils/signer-text.utils";
import { currentSignerNames } from "./certificate-form-draft.utils";
import { foldText } from "./search-text.utils";
import { joinWithAnd } from "~/shared/utils/format.utils";

const MANUAL_DETAILS = "Customers enter this code on your verification page.";
const FILL_LABELS: [Exclude<FillKey, "product-removed">, string][] = [
  ["item", "item name"],
  ["product", "linked product"],
  ["signer", "signer"],
  ["signers", "signers"],
  ["code", "certificate code"],
];

function naturalSuggestion(state: FormState): CodeSuggestion | null {
  const { draft } = state;

  if (!draft.order?.name) {
    return null;
  }

  return suggestCode(
    {
      codePrefix: state.codePrefix,
      orderName: draft.order.name,
      signerNames: currentSignerNames(draft),
      item: draft.item,
      productId: draft.product?.id ?? null,
    },
    state.dictionary,
  );
}

export function codeSuggestion(state: FormState): CodeSuggestionState {
  const { draft } = state;
  const natural = naturalSuggestion(state);

  if (!natural) {
    return { natural: null, value: null, collision: "none" };
  }

  const value = resolveCollision(
    natural.code,
    new Set([...draft.takenCodes, ...draft.codesTakenLive]),
    natural.parts.season,
  );

  return { natural, value, collision: collisionOf(natural.code, value) };
}

// A natural code never contains "-", so a trailing -n always comes from the collision rule.
function collisionOf(natural: string, value: string | null): CodeCollision {
  if (value === null) {
    return "exhausted";
  }

  if (value === natural) {
    return "none";
  }

  return /-\d{1,2}$/.test(value) ? "dash" : "season";
}

export function codeDetails(state: FormState): string {
  if (state.kind === "edit" || state.codeMode === "manual") {
    return MANUAL_DETAILS;
  }

  if (!state.draft.order) {
    return "A code is suggested when you select an order.";
  }

  if (currentSignerNames(state.draft).length === 0) {
    return "Add who signed it to complete the code.";
  }

  const { natural, value, collision } = codeSuggestion(state);

  if (natural && value && collision === "dash") {
    const suffix = value.slice(value.lastIndexOf("-") + 1);

    return `${natural.code} is already used, so -${suffix} was added.`;
  }

  if (natural && collision === "season") {
    return `${natural.code} is already used, so the season was added.`;
  }

  if (natural?.confidence === "low") {
    return "Check the letters after the order number before saving.";
  }

  return "Suggested from the order number, signer initials, team, and season.";
}

export function suggestedCode(state: FormState): string | null {
  const { value } = codeSuggestion(state);

  if (!value || value === state.draft.code) {
    return null;
  }

  if (state.kind !== "edit") {
    return state.codeMode === "manual" ? value : null;
  }

  if (!state.draft.pickedInDraft) {
    return null;
  }

  const legacyLink = !state.baseline.order?.id;
  const token = orderToken(state.draft.order?.name);

  // Customers already hold a legacy code that names this order.
  if (legacyLink && token && (state.savedCode ?? "").includes(token)) {
    return null;
  }

  return value;
}

export function filledLine(state: FormState): string | null {
  const parts = FILL_LABELS.filter(([key]) =>
    state.draft.filled.includes(key),
  ).map(([, label]) => label);
  const removed = state.draft.filled.includes("product-removed")
    ? "The linked product was removed."
    : "";

  if (parts.length === 0) {
    return removed || null;
  }

  return `Filled in from the order: ${joinWithAnd(parts)}.${removed ? ` ${removed}` : ""}`;
}

export function signerWarning(
  state: FormState,
): { text: string; useName: string | null } | null {
  const { draft } = state;
  const listed = currentSignerNames(draft);

  // With no name listed, the name field's own error asks for one.
  if (
    !draft.pickedInDraft ||
    !draft.signerHint ||
    draft.signerWarningDismissed ||
    listed.length === 0
  ) {
    return null;
  }

  const listedFolded = new Set(listed.map(foldText));

  if (draft.signerHint.every((name) => listedFolded.has(foldText(name)))) {
    return null;
  }

  const singleName = draft.signerHint.length === 1;
  const role = singleName ? "signer" : "signers";

  return {
    text: `The order item names ${joinNames(draft.signerHint)} as the ${role}. This certificate lists ${joinNames(listed)}.`,
    useName: singleName ? draft.signerHint[0] : null,
  };
}
