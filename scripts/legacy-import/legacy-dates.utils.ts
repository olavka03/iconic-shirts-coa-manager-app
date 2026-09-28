import { foldText } from "~/features/certificates/utils/search-text.utils";
import {
  isNotFuture,
  isValidDayIso,
  isValidMonthIso,
  type SigningDate,
} from "~/shared/utils/signing-date.utils";
import { cleanText } from "~/shared/utils/text.utils";

const ENGLISH: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};
const DUTCH: Record<string, number> = {
  januari: 1,
  februari: 2,
  maart: 3,
  mei: 5,
  juni: 6,
  juli: 7,
  augustus: 8,
  oktober: 10,
};
const GERMAN: Record<string, number> = {
  januar: 1,
  februar: 2,
  marz: 3,
  mai: 5,
  oktober: 10,
  dezember: 12,
};
const MONTHS: Record<string, number> = { ...ENGLISH, ...DUTCH, ...GERMAN };

export function monthNumber(word: string): number | null {
  return MONTHS[foldText(word).replace(/\.$/, "")] ?? null;
}

const twoDigits = (value: number) => String(value).padStart(2, "0");

function dayDate(
  year: number,
  month: number,
  dayOfMonth: number,
  now: Date,
): SigningDate | null {
  const date: SigningDate = {
    precision: "DAY",
    iso: `${year}-${twoDigits(month)}-${twoDigits(dayOfMonth)}`,
  };

  return isValidDayIso(date.iso) &&
    year <= now.getUTCFullYear() &&
    isNotFuture(date, now)
    ? date
    : null;
}

function monthDate(year: number, month: number, now: Date): SigningDate | null {
  const date: SigningDate = {
    precision: "MONTH",
    iso: `${year}-${twoDigits(month)}`,
  };

  return isValidMonthIso(date.iso) &&
    year <= now.getUTCFullYear() &&
    isNotFuture(date, now)
    ? date
    : null;
}

export function parseLegacyDate(
  text: string,
  now: Date = new Date(),
): SigningDate | null {
  const normalized = cleanText(
    cleanText(text)
      .replace(/(\d{1,2})(st|nd|rd|th)\b/gi, "$1")
      .replace(/\bof\b/gi, " "),
  );
  const numeric = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(normalized);

  if (numeric) {
    return dayDate(+numeric[1], +numeric[2], +numeric[3], now);
  }

  const dayFirst = /^(\d{1,2}) (\p{L}+)\.?,? (\d{4})$/u.exec(normalized);

  if (dayFirst) {
    const month = monthNumber(dayFirst[2]);

    return month ? dayDate(+dayFirst[3], month, +dayFirst[1], now) : null;
  }

  const monthFirst = /^(\p{L}+)\.? (\d{1,2}),? (\d{4})$/u.exec(normalized);

  if (monthFirst) {
    const month = monthNumber(monthFirst[1]);

    return month ? dayDate(+monthFirst[3], month, +monthFirst[2], now) : null;
  }

  const monthOnly = /^(\p{L}+)\.?,? (\d{4})$/u.exec(normalized);

  if (monthOnly) {
    const month = monthNumber(monthOnly[1]);

    return month ? monthDate(+monthOnly[2], month, now) : null;
  }

  return null;
}

export function isYearlessDate(text: string): boolean {
  const match = /^(\d{1,2})(?:st|nd|rd|th)? (?:of )?(\p{L}+)$/iu.exec(
    cleanText(text),
  );

  return match !== null && monthNumber(match[2]) !== null;
}
