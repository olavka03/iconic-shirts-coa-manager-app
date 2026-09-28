export type PageSlot = number | "gap";

const SHOW_ALL_UP_TO = 7;
const EDGE_RUN = 5;

// Up to 7 pages all show. Beyond that the first and last pages always show with the current page
// and its neighbours; near either end a run of five keeps the row the same length.
export function pageWindow(current: number, pageCount: number): PageSlot[] {
  const pages = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_unused, offset) => from + offset);

  if (pageCount <= SHOW_ALL_UP_TO) {
    return pages(1, pageCount);
  }

  if (current <= EDGE_RUN - 1) {
    return [...pages(1, EDGE_RUN), "gap", pageCount];
  }

  if (current >= pageCount - (EDGE_RUN - 2)) {
    return [1, "gap", ...pages(pageCount - EDGE_RUN + 1, pageCount)];
  }

  return [1, "gap", current - 1, current, current + 1, "gap", pageCount];
}

const COUNT_FORMAT = new Intl.NumberFormat("en-US");

export function rangeText(
  page: number,
  perPage: number,
  total: number,
): string | null {
  if (total === 0) {
    return null;
  }

  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  return `${COUNT_FORMAT.format(from)}–${COUNT_FORMAT.format(to)} of ${COUNT_FORMAT.format(total)}`;
}
