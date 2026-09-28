export type SigningDate =
  { precision: "DAY"; iso: string } | { precision: "MONTH"; iso: string };

export const EARLIEST_SIGNING_YEAR = 1900;

const DAY_MS = 86_400_000;

export function toDbDate(date: SigningDate): Date {
  return new Date(`${sortKey(date)}T00:00:00Z`);
}

export function fromDbDate(
  date: Date,
  precision: "DAY" | "MONTH",
): SigningDate {
  const iso = date.toISOString().slice(0, 10);

  return precision === "DAY"
    ? { precision, iso }
    : { precision, iso: iso.slice(0, 7) };
}

export function sortKey(date: SigningDate): string {
  return date.precision === "DAY" ? date.iso : `${date.iso}-01`;
}

export function isValidDayIso(iso: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);

  if (!match) {
    return false;
  }

  const [year, month, day] = match.slice(1).map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));

  return (
    year >= EARLIEST_SIGNING_YEAR &&
    calendarDate.getUTCFullYear() === year &&
    calendarDate.getUTCMonth() === month - 1 &&
    calendarDate.getUTCDate() === day
  );
}

export function isValidMonthIso(iso: string): boolean {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(iso);

  return match !== null && Number(match[1]) >= EARLIEST_SIGNING_YEAR;
}

// One day of slack so an admin east of UTC can enter their own "today".
export function isNotFuture(date: SigningDate, now: Date): boolean {
  const limit = new Date(now.getTime() + DAY_MS).toISOString().slice(0, 10);

  return sortKey(date) <= limit;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

// Browser only: the viewer's calendar day, which toISOString() would shift to UTC.
export function todayIsoLocal(now: Date = new Date()): string {
  return `${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}`;
}
