import type { FieldErrors } from "~/shared/types/api.types";
import { SIGNER_ERROR_KEY } from "~/features/certificates/constants/certificate-form.constants";

export type SummaryEntry = { key: string; label: string; message: string };

type FieldSlot = { rank: number; label: string; row: number; part: number };

const SIGNERS_FIELD = "signers.*";
const FIELD_LABELS: [string, string][] = [
  ["order", "Order"],
  ["lineItem", "Order"],
  ["code", "Certificate code"],
  ["item", "Item"],
  ["productId", "Linked product"],
  [SIGNERS_FIELD, "Signed by"],
  ["photo", "Photo"],
  ["video", "Video"],
  ["notes", "Notes"],
];
const SIGNER_PARTS = ["name", "date", "month", "year", "location"];
const PRODUCT_HINT_KEY = /^productHint(\.|$)/;

export const FIELD_ORDER: readonly string[] = FIELD_LABELS.map(([key]) => key);

function slotOf(field: string, row = -1, part = -1): FieldSlot {
  const rank = FIELD_ORDER.indexOf(field);

  return { rank, label: FIELD_LABELS[rank][1], row, part };
}

function signerSlot(key: string): FieldSlot | null {
  const match = SIGNER_ERROR_KEY.exec(key);

  if (match === null) {
    return key === "signers" ? slotOf(SIGNERS_FIELD) : null;
  }

  const row = Number(match[1]);
  const part = SIGNER_PARTS.indexOf(match[2] ?? "name");

  return {
    ...slotOf(SIGNERS_FIELD, row, part === -1 ? SIGNER_PARTS.length : part),
    label: `Signer ${row + 1}`,
  };
}

// The product hint travels with the linked product, so its errors sit right after productId.
function fieldSlot(key: string): FieldSlot {
  if (FIELD_ORDER.includes(key) && key !== SIGNERS_FIELD) {
    return slotOf(key);
  }

  if (PRODUCT_HINT_KEY.test(key)) {
    return slotOf("productId", 0);
  }

  return (
    signerSlot(key) ?? {
      rank: FIELD_ORDER.length,
      label: "Certificate",
      row: -1,
      part: -1,
    }
  );
}

function compareSlots(first: FieldSlot, second: FieldSlot): number {
  return (
    first.rank - second.rank ||
    first.row - second.row ||
    first.part - second.part
  );
}

export function orderedErrors(errors: FieldErrors): SummaryEntry[] {
  return Object.entries(errors)
    .map(([key, message]) => ({ key, message, slot: fieldSlot(key) }))
    .sort((first, second) => compareSlots(first.slot, second.slot))
    .map(({ key, message, slot }) => ({ key, label: slot.label, message }));
}

export function summaryHeading(count: number): string {
  return count === 1
    ? "There is 1 error with this certificate"
    : `There are ${count} errors with this certificate`;
}

export function fieldError(
  errors: FieldErrors,
  key: string,
): string | undefined {
  return Object.hasOwn(errors, key) ? errors[key] : undefined;
}
