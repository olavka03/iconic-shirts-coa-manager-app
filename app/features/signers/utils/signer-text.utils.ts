import { formatDateLong, formatDateShort } from "~/shared/utils/format.utils";
import { sortKey, type SigningDate } from "~/shared/utils/signing-date.utils";
import { cleanText } from "~/shared/utils/text.utils";

export type SignerLike = {
  name: string;
  date: SigningDate | null;
  location: string | null;
};

const NAME_SEPARATOR = /\s*,\s*(?:and\s+)?|\s+&\s+|\s+and\s+/i;

export function splitNames(text: string): string[] {
  return cleanText(text).split(NAME_SEPARATOR).map(cleanText).filter(Boolean);
}

// Legacy style: no Oxford comma.
export function joinNames(names: string[]): string {
  if (names.length <= 1) {
    return names[0] ?? "";
  }

  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function composeLegacyText(signers: SignerLike[]): {
  signed: string;
  date: string;
  location: string;
} {
  return {
    signed: joinNames(signers.map((signer) => signer.name)),
    date: composeAttribute(signers, (signer) =>
      signer.date ? formatDateLong(signer.date) : "",
    ),
    location: composeAttribute(signers, (signer) => signer.location ?? ""),
  };
}

// The shared form only when every signer has the same value; otherwise "value (names)" groups
// in first-appearance order, joined by "; " because the values themselves contain commas.
function composeAttribute(
  signers: SignerLike[],
  valueOf: (signer: SignerLike) => string,
): string {
  const entries = signers.map((signer) => ({
    name: signer.name,
    value: valueOf(signer).trim(),
  }));
  const withValue = entries.filter((entry) => entry.value !== "");
  const distinct = [...new Set(withValue.map((entry) => entry.value))];

  if (distinct.length === 1 && withValue.length === entries.length) {
    return distinct[0];
  }

  return distinct
    .map((value) => {
      const names = withValue
        .filter((entry) => entry.value === value)
        .map((entry) => entry.name);

      return `${value} (${joinNames(names)})`;
    })
    .join("; ");
}

export function signerSummary(names: string[]): string {
  return names.length <= 2
    ? joinNames(names)
    : `${names[0]} and ${names.length - 1} more`;
}

export function dateSignedLabel(signers: SignerLike[]): string {
  const dates = signers
    .map((signer) => signer.date)
    .filter((date): date is SigningDate => date !== null)
    .sort((left, right) => sortKey(left).localeCompare(sortKey(right)));

  if (dates.length === 0) {
    return "";
  }

  const first = dates[0];
  const last = dates[dates.length - 1];

  if (sortKey(first) === sortKey(last) && first.precision === last.precision) {
    return formatDateShort(first);
  }

  const firstMonth = formatDateShort({
    precision: "MONTH",
    iso: first.iso.slice(0, 7),
  });
  const lastMonth = formatDateShort({
    precision: "MONTH",
    iso: last.iso.slice(0, 7),
  });

  return firstMonth === lastMonth ? firstMonth : `${firstMonth}–${lastMonth}`;
}
