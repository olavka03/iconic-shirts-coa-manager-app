import { parseCode } from "~/features/codes/utils/code.utils";
import { orderNameSymbols } from "~/features/orders/utils/orders.utils";

export type OrderNumberModel = { digits: number; low: number; high: number };

export type BackfillResult =
  | { ok: true; orderName: string }
  | {
      ok: false;
      reason: "no_number" | "implausible_number" | "prefix_mismatch";
    };

function modalLength(digitRuns: readonly string[]): number {
  const countByLength = new Map<number, number>();

  for (const digitRun of digitRuns) {
    countByLength.set(
      digitRun.length,
      (countByLength.get(digitRun.length) ?? 0) + 1,
    );
  }

  const [[mostCommonLength]] = [...countByLength].sort(
    ([leftLength, leftCount], [rightLength, rightCount]) =>
      rightCount - leftCount || rightLength - leftLength,
  );

  return mostCommonLength;
}

export function learnOrderNumberModel(
  codes: readonly string[],
): OrderNumberModel | null {
  const digitRuns = codes.flatMap((code) => parseCode(code)?.number ?? []);

  if (digitRuns.length === 0) {
    return null;
  }

  const digits = modalLength(digitRuns);
  const sorted = digitRuns
    .filter((digitRun) => digitRun.length === digits)
    .map(Number)
    .sort((left, right) => left - right);
  const quartile = (fraction: number) =>
    sorted[Math.floor(fraction * (sorted.length - 1))];
  const lowerQuartile = quartile(0.25);
  const upperQuartile = quartile(0.75);
  const interquartileRange = upperQuartile - lowerQuartile;

  // Tukey's far-out fences: typos and numbers from other systems fall outside.
  return {
    digits,
    low: lowerQuartile - 3 * interquartileRange,
    high: upperQuartile + 3 * interquartileRange,
  };
}

// Codes carry only an order name's digits, so letters after the prefix's symbols (EN) can't be rebuilt.
export function isBackfillablePrefix(formatPrefix: string): boolean {
  return /^\d*$/.test(
    formatPrefix.slice(orderNameSymbols(formatPrefix).length),
  );
}

export function backfillOrderName(
  code: string,
  model: OrderNumberModel | null,
  formatPrefix: string,
  formatSuffix: string,
): BackfillResult {
  const digitRun = parseCode(code)?.number ?? null;

  if (digitRun === null) {
    return { ok: false, reason: "no_number" };
  }

  if (!isBackfillablePrefix(formatPrefix)) {
    return { ok: false, reason: "prefix_mismatch" };
  }

  const symbols = orderNameSymbols(formatPrefix);
  const prefixDigits = formatPrefix.slice(symbols.length);
  const orderNumber = Number(digitRun);

  if (
    model === null ||
    digitRun.length !== model.digits ||
    orderNumber < model.low ||
    orderNumber > model.high
  ) {
    return { ok: false, reason: "implausible_number" };
  }

  // A prefix such as #14 is part of the number Shopify shows, so the code's run must start with it.
  if (!digitRun.startsWith(prefixDigits)) {
    return { ok: false, reason: "prefix_mismatch" };
  }

  return { ok: true, orderName: symbols + digitRun + formatSuffix };
}
