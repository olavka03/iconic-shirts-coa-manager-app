import { foldText } from "~/features/certificates/utils/search-text.utils";
import {
  splitNames,
  type SignerLike,
} from "~/features/signers/utils/signer-text.utils";
import type { SigningDate } from "~/shared/utils/signing-date.utils";
import { cleanText } from "~/shared/utils/text.utils";
import { isYearlessDate, parseLegacyDate } from "./legacy-dates.utils";
import type {
  AddIssue,
  LegacyRecord,
  SignerPattern,
} from "./legacy-import.types";

type ParsedSigners = { signers: SignerLike[]; pattern: SignerPattern };

export const recordText = (record: LegacyRecord, key: string) =>
  cleanText(record[key]);

export function parseSigners(
  record: LegacyRecord,
  now: Date,
  add: AddIssue,
): ParsedSigners {
  const signed = recordText(record, "signed");
  const dateText = recordText(record, "date");
  const location = recordText(record, "location") || null;

  return (
    strategyD(record, signed, now, add) ??
    strategyC(signed, dateText, now) ??
    strategyB1(signed, location, now, add) ??
    strategyB2(signed, dateText, location, now, add) ??
    strategyA(signed, dateText, location, now, add)
  );
}

// "Alex Stepney in Manchester on 3 March 2024, …" in a `location and date` or `date and location` key.
function strategyD(
  record: LegacyRecord,
  signed: string,
  now: Date,
  add: AddIssue,
): ParsedSigners | null {
  const text =
    recordText(record, "location and date") ||
    recordText(record, "date and location");

  if (!text) {
    return null;
  }

  // Commas only before the next "X in Y on", so "May 3, 2024" stays whole.
  const parts = text.includes(" - ")
    ? text.split(" - ")
    : text.split(/,\s+(?=[^,]+ in [^,]+ on )/);
  const matches = parts
    .map((part) => /^(.+?) in (.+?) on (.+)$/.exec(cleanText(part)))
    .filter((match): match is RegExpExecArray => match !== null);

  if (matches.length !== parts.length) {
    return null;
  }

  const signers = matches.map(([, name, location, dateText]) => ({
    name: cleanText(name),
    date: signerDate(dateText, now, add),
    location: cleanText(location),
  }));
  const listed = new Set(splitNames(signed).map(foldText));

  if (
    signers.length !== listed.size ||
    signers.some((signer) => !listed.has(foldText(signer.name)))
  ) {
    add(
      "warning",
      "NAMES_DIFFER",
      `Names in "signed" differ from the date and location list.`,
    );
  }

  return { pattern: "d", signers };
}

// "Name, City, Date, Name, City, Date, …" in `signed`, with no top-level date.
function strategyC(
  signed: string,
  dateText: string,
  now: Date,
): ParsedSigners | null {
  if (dateText) {
    return null;
  }

  const parts = signed.split(/,\s+/).map(cleanText);

  if (parts.length < 6 || parts.length % 3 !== 0) {
    return null;
  }

  const dates = parts.map((part) => parseLegacyDate(part, now));
  const datesEveryThird = dates.every(
    (date, index) => (index % 3 === 2) === (date !== null),
  );

  if (!datesEveryThird) {
    return null;
  }

  const signers: SignerLike[] = [];

  for (let start = 0; start < parts.length; start += 3) {
    signers.push({
      name: parts[start],
      date: dates[start + 2],
      location: parts[start + 1],
    });
  }

  return { pattern: "c", signers };
}

// Longest suffix first: the shortest reading of "Thierry Henry 28th November 2019" would be
// "November 2019" (MONTH) and leave "Thierry Henry 28th" as the name.
function dateSuffix(
  token: string,
  now: Date,
): { name: string; date: SigningDate | null; yearless: boolean } | null {
  const words = token.split(" ");

  for (let splitAt = 0; splitAt < words.length; splitAt++) {
    const tail = words.slice(splitAt).join(" ");
    const name = words.slice(0, splitAt).join(" ");
    const date = parseLegacyDate(tail, now);

    if (date) {
      return { name, date, yearless: false };
    }

    if (isYearlessDate(tail)) {
      return { name, date: null, yearless: true };
    }
  }

  return null;
}

// Names and dates interleaved in `signed`; a date applies to every pending name before it.
function strategyB1(
  signed: string,
  location: string | null,
  now: Date,
  add: AddIssue,
): ParsedSigners | null {
  const tokens = splitNames(signed);
  const found = tokens.map((token) => dateSuffix(token, now));

  if (!found.some(Boolean)) {
    return null;
  }

  const signers: SignerLike[] = [];
  const pending: string[] = [];

  for (const [tokenIndex, token] of tokens.entries()) {
    const suffix = found[tokenIndex];

    if (!suffix) {
      pending.push(token);
      continue;
    }

    if (suffix.name) {
      pending.push(suffix.name);
    }

    if (suffix.yearless) {
      add("error", "MISSING_YEAR", `"${token}" has no year.`);
    }

    signers.push(
      ...pending
        .splice(0)
        .map((name) => ({ name, date: suffix.date, location })),
    );
  }

  signers.push(...pending.map((name) => ({ name, date: null, location })));

  return { pattern: "b1", signers };
}

const SEGMENT = /([^()]+?)\s*\(([^)]+)\)/g;

type Segment = { value: string; who: string };

function segmentsOf(text: string): Segment[] {
  return [...text.matchAll(SEGMENT)].map((match) => ({
    value: cleanText(match[1]).replace(/^(?:[;,-]|and)\s+/i, ""),
    who: cleanText(match[2]),
  }));
}

function signerIndexFor(foldedNames: string[], part: string): number | null {
  const foldedPart = foldText(part);
  const exact = foldedNames.indexOf(foldedPart);

  if (exact >= 0) {
    return exact;
  }

  const bySuffix = foldedNames.flatMap((foldedName, nameIndex) =>
    foldedName.endsWith(` ${foldedPart}`) ? [nameIndex] : [],
  );

  return bySuffix.length === 1 ? bySuffix[0] : null;
}

function assignSegments(
  segments: Segment[],
  foldedNames: string[],
  add: AddIssue,
): Map<number, string> {
  const valuesBySigner = new Map<number, string>();

  for (const segment of segments) {
    for (const part of splitNames(segment.who)) {
      const signerIndex = signerIndexFor(foldedNames, part);

      if (signerIndex === null) {
        add(
          "error",
          "UNMATCHED_SIGNER",
          `"${part}" is not one of the signers.`,
        );
      } else {
        valuesBySigner.set(signerIndex, segment.value);
      }
    }
  }

  return valuesBySigner;
}

function signerDate(
  text: string | undefined,
  now: Date,
  add: AddIssue,
): SigningDate | null {
  const date = text ? parseLegacyDate(text, now) : null;

  if (text && !date) {
    add("error", "DATE_UNPARSED", `Couldn't read the date "${text}".`);
  }

  return date;
}

// Two or more names, and `value (Who)` segments in the date and/or the location.
function strategyB2(
  signed: string,
  dateText: string,
  location: string | null,
  now: Date,
  add: AddIssue,
): ParsedSigners | null {
  const names = splitNames(signed);

  if (names.length < 2) {
    return null;
  }

  const foldedNames = names.map(foldText);
  const dateSegments = segmentsOf(dateText);
  const locationSegments = segmentsOf(location ?? "");
  const anyMatch = [...dateSegments, ...locationSegments].some((segment) =>
    splitNames(segment.who).some(
      (part) => signerIndexFor(foldedNames, part) !== null,
    ),
  );

  if (!anyMatch) {
    return null;
  }

  const dates =
    dateSegments.length > 0
      ? assignSegments(dateSegments, foldedNames, add)
      : null;
  const locations =
    locationSegments.length > 0
      ? assignSegments(locationSegments, foldedNames, add)
      : null;
  const sharedDate = dates === null ? signerDate(dateText, now, add) : null;
  const signers = names.map((name, signerIndex) => ({
    name,
    date: dates ? signerDate(dates.get(signerIndex), now, add) : sharedDate,
    location: locations ? (locations.get(signerIndex) ?? null) : location,
  }));

  return { pattern: "b2", signers };
}

function strategyA(
  signed: string,
  dateText: string,
  location: string | null,
  now: Date,
  add: AddIssue,
): ParsedSigners {
  const date = signerDate(dateText, now, add);

  return {
    pattern: "a",
    signers: splitNames(signed).map((name) => ({ name, date, location })),
  };
}
