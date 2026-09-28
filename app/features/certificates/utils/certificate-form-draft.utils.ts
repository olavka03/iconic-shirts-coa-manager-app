import { ITEM_MAX } from "~/features/certificates/constants/certificate-limits.constants";
import type {
  DateAndLocation,
  DateDraft,
  Draft,
  FormKind,
  FormState,
  SignerMode,
} from "~/features/certificates/types/certificate-form.types";
import type { TeamDictionary } from "~/features/codes/types/code-generator.types";
import { parseProductTitle } from "~/features/codes/utils/product-title.utils";
import { isKnownTeam } from "~/features/codes/utils/team-names.utils";
import type { CertificateFormValues } from "~/features/certificates/types/certificates.types";
import type {
  OrderCard,
  OrderCertificateReference,
} from "~/features/orders/types/orders.types";
import type { SignerValue } from "~/features/signers/types/signers.types";
import {
  EARLIEST_SIGNING_YEAR,
  todayIsoLocal,
  type SigningDate,
} from "~/shared/utils/signing-date.utils";

export const signerRowKey = (index: number) => `s${index}`;

export function signerKeys(start: number, count: number): string[] {
  return [...Array(count).keys()].map((offset) => signerRowKey(start + offset));
}

function emptyDateAndLocation(): DateAndLocation {
  return { date: { dayUnknown: false, iso: "", view: null }, location: "" };
}

export function emptyDraft(): Draft {
  return {
    code: "",
    item: "",
    notes: "",
    order: null,
    lineItem: null,
    orderCard: null,
    orderCertificates: [],
    takenCodes: [],
    codesTakenLive: [],
    product: null,
    photo: null,
    video: null,
    signers: [{ key: signerRowKey(0), name: "", own: emptyDateAndLocation() }],
    sharedOn: false,
    shared: emptyDateAndLocation(),
    sharedBaseline: null,
    filled: [],
    touched: { item: false, product: false },
    derivedItem: null,
    derivedProductId: null,
    signerHint: null,
    signerWarningDismissed: false,
    pickedInDraft: false,
  };
}

function toDateDraft(date: SigningDate | null): DateDraft {
  if (date?.precision === "MONTH") {
    return {
      dayUnknown: true,
      month: date.iso.slice(5, 7),
      year: date.iso.slice(0, 4),
    };
  }

  return { dayUnknown: false, iso: date?.iso ?? "", view: null };
}

export function currentYear(): number {
  return Number(todayIsoLocal().slice(0, 4));
}

export function isValidYear(year: string): boolean {
  return (
    /^\d{4}$/.test(year) &&
    Number(year) >= EARLIEST_SIGNING_YEAR &&
    Number(year) <= currentYear()
  );
}

// An out-of-range year is reported once, as a year error, instead of also failing the date.
export function toSigningDate(date: DateDraft): SigningDate | null {
  if (!date.dayUnknown) {
    return date.iso === "" ? null : { precision: "DAY", iso: date.iso };
  }

  const year = date.year.trim();

  return date.month !== "" && isValidYear(year)
    ? { precision: "MONTH", iso: `${year}-${date.month}` }
    : null;
}

function dateValue(date: DateDraft): string {
  if (date.dayUnknown) {
    const year = date.year.trim();

    return date.month === "" && year === ""
      ? ""
      : `month:${date.month}:${year}`;
  }

  return date.iso === "" ? "" : `day:${date.iso}`;
}

export function sameDateAndLocation(
  first: DateAndLocation,
  second: DateAndLocation,
): boolean {
  return (
    first.location.trim() === second.location.trim() &&
    dateValue(first.date) === dateValue(second.date)
  );
}

export function isEmptyDateAndLocation(value: DateAndLocation): boolean {
  return value.location.trim() === "" && dateValue(value.date) === "";
}

export function parseTitle(
  title: string,
  dictionary: TeamDictionary,
): { signers: string[]; item: string } {
  const parsed = parseProductTitle(title, {
    isTeam: (name) => isKnownTeam(name, dictionary),
  });

  return { signers: parsed.signers, item: parsed.item.slice(0, ITEM_MAX) };
}

function draftFromValues(
  values: CertificateFormValues,
  keys: string[],
  extra: Partial<Draft>,
  preferShared = true,
): Draft {
  const rows: SignerValue[] =
    values.signers.length > 0
      ? values.signers
      : [{ name: "", date: null, location: "" }];
  const signers = rows.map((signer, index) => ({
    key: keys[index],
    name: signer.name,
    own: { date: toDateDraft(signer.date), location: signer.location },
  }));
  const [first] = signers;
  const sharedOn =
    preferShared &&
    signers.length > 1 &&
    signers.every((signer) => sameDateAndLocation(signer.own, first.own));

  return {
    ...emptyDraft(),
    code: values.code,
    item: values.item,
    notes: values.notes,
    order: values.order,
    lineItem: values.lineItem,
    product: values.product,
    photo: values.photo,
    video: values.video,
    signers,
    sharedOn,
    shared: sharedOn ? first.own : emptyDateAndLocation(),
    sharedBaseline: sharedOn ? first.own : null,
    ...extra,
  };
}

export function savedDraft(
  values: CertificateFormValues,
  keys: string[],
  dictionary: TeamDictionary,
  order: { card: OrderCard | null; certificates: OrderCertificateReference[] },
  preferShared?: boolean,
): Draft {
  return draftFromValues(
    values,
    keys,
    {
      orderCard: order.card,
      orderCertificates: order.certificates,
      derivedItem: values.lineItem
        ? parseTitle(values.lineItem.title, dictionary).item
        : null,
      derivedProductId: values.lineItem ? (values.product?.id ?? null) : null,
    },
    preferShared,
  );
}

export function createFormState(options: {
  kind: FormKind;
  values: CertificateFormValues;
  certificateId: string | null;
  codePrefix: string;
  dictionary: TeamDictionary;
  orderCard?: OrderCard | null;
  orderCertificates?: OrderCertificateReference[];
}): FormState {
  const base = {
    kind: options.kind,
    certificateId: options.certificateId,
    codePrefix: options.codePrefix,
    dictionary: options.dictionary,
    errors: {},
    attemptedSave: false,
    autoRetried: false,
  };

  if (options.kind === "create") {
    const draft = emptyDraft();

    return {
      ...base,
      savedCode: null,
      baseline: draft,
      draft,
      codeMode: "auto",
      nextKey: draft.signers.length,
    };
  }

  const count = Math.max(options.values.signers.length, 1);
  const keys = signerKeys(0, count);

  if (options.kind === "duplicate") {
    return {
      ...base,
      savedCode: null,
      baseline: emptyDraft(),
      draft: draftFromValues(options.values, keys, {
        code: "",
        order: null,
        lineItem: null,
        derivedItem: options.values.item,
      }),
      codeMode: "auto",
      nextKey: count,
    };
  }

  const draft = savedDraft(options.values, keys, options.dictionary, {
    card: options.orderCard ?? null,
    certificates: options.orderCertificates ?? [],
  });

  return {
    ...base,
    savedCode: options.values.code,
    baseline: draft,
    draft,
    codeMode: "manual",
    nextKey: count,
  };
}

export function signerMode(draft: Draft): SignerMode {
  if (draft.signers.length <= 1) {
    return "one";
  }

  return draft.sharedOn ? "shared" : "separate";
}

export function sharedOverridesOthers(draft: Draft): boolean {
  const [first, ...others] = draft.signers;

  return (
    signerMode(draft) === "shared" &&
    others.some((signer) => !sameDateAndLocation(signer.own, first.own))
  );
}

export function currentSignerNames(draft: Draft): string[] {
  return draft.signers
    .map((signer) => signer.name.trim())
    .filter((name) => name !== "");
}

export function withDraft(state: FormState, patch: Partial<Draft>): FormState {
  return { ...state, draft: { ...state.draft, ...patch } };
}
