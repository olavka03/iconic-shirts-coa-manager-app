import type {
  Season,
  SeasonForm,
} from "~/features/codes/types/code-generator.types";
import { cleanText } from "~/shared/utils/text.utils";

const SEASON_RANGE_PATTERN =
  /(?<!\d)((?:19|20)\d{2})\s*[-–—/]\s*((?:19|20)\d{2}|\d{2})(?!\d)/;
const YEAR_PATTERN = /(?<!\d)((?:19|20)\d{2})(?!\d)/;

// A two-digit end takes the start's century, plus 100 when smaller: 1998-00 ends in 2000.
function fullEndYear(start: number, end: string): number {
  if (end.length !== 2) {
    return Number(end);
  }

  const year = Math.floor(start / 100) * 100 + Number(end);

  return year < start ? year + 100 : year;
}

export function extractSeason(text: string): Season | null {
  const cleaned = cleanText(text);
  const range = SEASON_RANGE_PATTERN.exec(cleaned);

  if (range) {
    const start = Number(range[1]);
    const end = fullEndYear(start, range[2]);

    if (end > start && end - start <= 3) {
      return { kind: "range", start, end, text: range[0] };
    }
  }

  const year = YEAR_PATTERN.exec(cleaned);

  return year
    ? { kind: "single", start: Number(year[1]), end: null, text: year[0] }
    : null;
}

const twoDigitYear = (year: number) => String(year % 100).padStart(2, "0");

export function formatSeason(season: Season | null): string {
  if (!season) {
    return "";
  }

  return season.kind === "single"
    ? twoDigitYear(season.start)
    : twoDigitYear(season.start) + twoDigitYear(season.end);
}

function seasonReadings(season: Season): [SeasonForm, string][] {
  if (season.kind === "single") {
    return [
      ["yy", twoDigitYear(season.start)],
      ["yyyy", String(season.start)],
    ];
  }

  return [
    ["yy+yy", twoDigitYear(season.start) + twoDigitYear(season.end)],
    ["y+y", `${season.start % 10}${season.end % 10}`],
    ["yyyy", String(season.start)],
    ["end-yy", twoDigitYear(season.end)],
    ["start-yy", twoDigitYear(season.start)],
  ];
}

export function classifySeason(
  digits: string,
  season: Season | null,
): SeasonForm {
  if (!digits) {
    return season ? "omitted" : "none";
  }

  if (!season) {
    return "other";
  }

  return (
    seasonReadings(season).find(([, reading]) => reading === digits)?.[0] ??
    "other"
  );
}

export const READABLE_SEASON: ReadonlySet<SeasonForm> = new Set([
  "yy+yy",
  "yy",
  "y+y",
  "yyyy",
  "end-yy",
  "start-yy",
]);
