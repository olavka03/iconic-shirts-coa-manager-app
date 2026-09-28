import { SIGNER_ERROR_KEY } from "~/features/certificates/constants/certificate-form.constants";
import type { Draft } from "~/features/certificates/types/certificate-form.types";
import { signerMode } from "./certificate-form-draft.utils";

// A media field has its id only on the drop zone or Replace, so its proof column is the fallback.
const FIELD_TARGETS = new Map<string, string[]>([
  ["order", ["select-order"]],
  ["lineItem", ["change-item", "change-order"]],
  ["code", ["certificate-code"]],
  ["item", ["certificate-item"]],
  ["productId", ["link-product"]],
  ["photo", ["media-photo", "proof-photo"]],
  ["video", ["media-video", "proof-video"]],
  ["notes", ["certificate-notes"]],
]);

function signerTargets(draft: Draft, index: number, part: string): string[] {
  const signer = draft.signers[index];

  if (signer === undefined) {
    return [];
  }

  const date =
    signerMode(draft) === "shared" ? draft.shared.date : signer.own.date;
  const field = part === "date" && date.dayUnknown ? "year" : part;

  return [`signer-${field}-${signer.key}`];
}

function fieldTargets(key: string, draft: Draft): string[] {
  const direct = FIELD_TARGETS.get(key);

  if (direct !== undefined) {
    return direct;
  }

  if (key.startsWith("productHint")) {
    return ["link-product"];
  }

  if (key === "signers") {
    return signerTargets(draft, 0, "name");
  }

  const match = SIGNER_ERROR_KEY.exec(key);

  return match === null
    ? []
    : signerTargets(draft, Number(match[1]), match[2] ?? "name");
}

export function focusField(key: string, draft: Draft): void {
  const target = fieldTargets(key, draft)
    .map((id) => document.getElementById(id))
    .find((found) => found !== null);

  target?.focus();
  target?.scrollIntoView({ block: "nearest" });
}
