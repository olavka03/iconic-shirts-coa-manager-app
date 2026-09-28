import type { SigningDate } from "./signing-date.utils";

export const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function formatWith(
  months: readonly string[],
  { precision, iso }: SigningDate,
): string {
  const [year, month, day] = iso.split("-").map(Number);
  const monthYear = `${months[month - 1]} ${year}`;

  return precision === "DAY" ? `${day} ${monthYear}` : monthYear;
}

export function formatDateLong(date: SigningDate): string {
  return formatWith(MONTHS_LONG, date);
}

export function formatDateShort(date: SigningDate): string {
  return formatWith(MONTHS_SHORT, date);
}

export function formatIsoDayShort(iso: string): string {
  return formatDateShort({ precision: "DAY", iso });
}

// h23 so midnight reads 00:05, never 24:05.
const ZONED_PARTS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
};

function zonedFormatter(timeZone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("en-US", { ...ZONED_PARTS, timeZone });
  } catch (error) {
    if (!(error instanceof RangeError)) {
      throw error;
    }

    return new Intl.DateTimeFormat("en-US", {
      ...ZONED_PARTS,
      timeZone: "UTC",
    });
  }
}

function zonedParts(iso: string, timeZone: string) {
  const parts = Object.fromEntries(
    zonedFormatter(timeZone)
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );

  return {
    day: `${Number(parts.day)} ${MONTHS_SHORT[Number(parts.month) - 1]} ${parts.year}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

export function formatOrderTime(iso: string, timeZone: string): string {
  const { day, time } = zonedParts(iso, timeZone);

  return `${day} at ${time}`;
}

export function formatTimestampDay(iso: string, timeZone: string): string {
  return zonedParts(iso, timeZone).day;
}

// A word boundary is used only when it keeps at least maxLength - 15 characters.
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  const kept = lastSpace >= maxLength - 15 ? cut.slice(0, lastSpace) : cut;

  return `${kept.trimEnd()}…`;
}

export function pluralize(count: number, noun: string): string {
  return `${count.toLocaleString("en-US")} ${noun}${count === 1 ? "" : "s"}`;
}

// What goes before the part at this index in "a", "a and b" or "a, b, and c".
export function listSeparator(index: number, total: number): string {
  if (index === 0) {
    return "";
  }

  if (total === 2) {
    return " and ";
  }

  return index === total - 1 ? ", and " : ", ";
}

export function joinWithAnd(parts: readonly string[]): string {
  return parts
    .map((part, index) => listSeparator(index, parts.length) + part)
    .join("");
}
