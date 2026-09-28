import {
  CertificateInputSchema,
  CreateCertificateInputSchema,
  toFieldErrors,
} from "~/features/certificates/schemas/certificate.schema";
import { SIGNER_ERROR_KEY } from "~/features/certificates/constants/certificate-form.constants";
import type {
  DateDraft,
  Draft,
  FormState,
} from "~/features/certificates/types/certificate-form.types";
import type { FieldErrors } from "~/shared/types/api.types";
import { EARLIEST_SIGNING_YEAR } from "~/shared/utils/signing-date.utils";
import {
  currentYear,
  isValidYear,
  signerMode,
} from "./certificate-form-draft.utils";
import { mediaInput, toInput } from "./certificate-form-input.utils";

const DATE_AND_LOCATION_PARTS = new Set(["date", "location"]);

export function withoutKeys(errors: FieldErrors, keys: string[]): FieldErrors {
  return Object.fromEntries(
    Object.entries(errors).filter(([key]) => !keys.includes(key)),
  );
}

function draftIndexOf(draft: Draft, rowKey: string | undefined): number {
  return draft.signers.findIndex((signer) => signer.key === rowKey);
}

// Shared mode shows one date and location, so the errors every sent signer gets for them collapse onto the first one sent.
function sharedRowIndex(draft: Draft, rowKeys: string[]): number {
  return draftIndexOf(draft, rowKeys[0]);
}

function draftErrorKey(key: string, draft: Draft, rowKeys: string[]): string {
  const match = SIGNER_ERROR_KEY.exec(key);

  if (match === null) {
    return key;
  }

  const [, sentIndex, part = ""] = match;
  const index =
    signerMode(draft) === "shared" && DATE_AND_LOCATION_PARTS.has(part)
      ? sharedRowIndex(draft, rowKeys)
      : draftIndexOf(draft, rowKeys[Number(sentIndex)]);
  const suffix = part === "" ? "" : `.${part}`;

  return index === -1 ? key : `signers.${index}${suffix}`;
}

export function toDraftErrors(
  errors: FieldErrors,
  draft: Draft,
  rowKeys: string[],
): FieldErrors {
  return Object.fromEntries(
    Object.entries(errors).map(([key, message]) => [
      draftErrorKey(key, draft, rowKeys),
      message,
    ]),
  );
}

function partialDateErrors(date: DateDraft): [string, string][] {
  if (!date.dayUnknown) {
    return [];
  }

  const year = date.year.trim();
  const errors: [string, string][] = [];

  if (year !== "" && date.month === "") {
    errors.push(["month", "Choose a month."]);
  }

  if ((year !== "" || date.month !== "") && !isValidYear(year)) {
    errors.push([
      "year",
      `Enter a year between ${EARLIEST_SIGNING_YEAR} and ${currentYear()}.`,
    ]);
  }

  return errors;
}

function dayUnknownErrors(draft: Draft, rowKeys: string[]): FieldErrors {
  const dates =
    signerMode(draft) === "shared"
      ? [{ index: sharedRowIndex(draft, rowKeys), date: draft.shared.date }]
      : draft.signers.map((signer, index) => ({
          index,
          date: signer.own.date,
        }));

  return Object.fromEntries(
    dates.flatMap(({ index, date }) =>
      partialDateErrors(date).map(([field, message]) => [
        `signers.${index}.${field}`,
        message,
      ]),
    ),
  );
}

export function clientErrors(state: FormState): FieldErrors {
  const { input, rowKeys } = toInput(state);
  const schema =
    state.kind === "edit"
      ? CertificateInputSchema
      : CreateCertificateInputSchema;
  const result = schema.safeParse(input);
  const fromSchema = result.success
    ? {}
    : toDraftErrors(toFieldErrors(result.error), state.draft, rowKeys);

  return { ...fromSchema, ...dayUnknownErrors(state.draft, rowKeys) };
}

// Errors only the server can find (a taken code, a full item, a rejected file) stay until their own field changes.
const SERVER_CHECKED = new Map<string, (draft: Draft) => string>([
  ["order", (draft) => draft.order?.id ?? ""],
  ["lineItem", (draft) => draft.lineItem?.id ?? ""],
  ["code", (draft) => draft.code],
  ["photo", (draft) => JSON.stringify(mediaInput(draft.photo))],
  ["video", (draft) => JSON.stringify(mediaInput(draft.video))],
]);

export function revalidated(before: Draft, next: FormState): FieldErrors {
  const kept = Object.entries(next.errors).filter(([key]) => {
    const fieldValue = SERVER_CHECKED.get(key);

    return (
      fieldValue !== undefined && fieldValue(before) === fieldValue(next.draft)
    );
  });

  return { ...Object.fromEntries(kept), ...clientErrors(next) };
}
