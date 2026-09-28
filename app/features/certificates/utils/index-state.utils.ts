import { formatIsoDayShort, pluralize } from "~/shared/utils/format.utils";
import {
  defaultDirection,
  hasActiveFilters,
  toSearchParams,
  type ListParams,
} from "./list-params.utils";

export type FilterChipData = {
  key: "photo" | "video" | "signed";
  label: string;
  remove: Partial<ListParams>;
  accessibilityLabel: string;
};

export type NoResultsAction = {
  label: "Clear search" | "Clear filters" | "Clear search and filters";
  patch: Partial<ListParams>;
};

export const CLEAR_SEARCH: Partial<ListParams> = { query: "" };

export const CLEAR_FILTERS: Partial<ListParams> = {
  photo: null,
  video: null,
  signedFrom: null,
  signedTo: null,
};

export const CLEAR_ALL: Partial<ListParams> = {
  ...CLEAR_SEARCH,
  ...CLEAR_FILTERS,
};

export function nextParams(
  params: ListParams,
  patch: Partial<ListParams>,
): ListParams {
  const sort = patch.sort ?? params.sort;
  const direction =
    patch.direction ??
    (sort === params.sort ? params.direction : defaultDirection(sort));

  return { ...params, ...patch, direction, page: patch.page ?? 1 };
}

function signedLabel(from: string | null, to: string | null): string | null {
  if (from !== null && to !== null) {
    return `Date signed: ${formatIsoDayShort(from)}–${formatIsoDayShort(to)}`;
  }

  if (from !== null) {
    return `Date signed: from ${formatIsoDayShort(from)}`;
  }

  return to === null ? null : `Date signed: until ${formatIsoDayShort(to)}`;
}

export function chipsFor(params: ListParams): FilterChipData[] {
  const signed = signedLabel(params.signedFrom, params.signedTo);
  const chips: (FilterChipData | null)[] = [
    params.photo === null
      ? null
      : {
          key: "photo",
          label: params.photo === "yes" ? "Has photo" : "No photo",
          remove: { photo: null },
          accessibilityLabel: "Remove photo filter",
        },
    params.video === null
      ? null
      : {
          key: "video",
          label: params.video === "yes" ? "Has video" : "No video",
          remove: { video: null },
          accessibilityLabel: "Remove video filter",
        },
    signed === null
      ? null
      : {
          key: "signed",
          label: signed,
          remove: { signedFrom: null, signedTo: null },
          accessibilityLabel: "Remove date signed filter",
        },
  ];

  return chips.filter((chip) => chip !== null);
}

export function resultCount(total: number): string {
  return pluralize(total, "certificate");
}

export function noResultsAction(params: ListParams): NoResultsAction {
  const searching = params.query !== "";
  const filtering = hasActiveFilters(params);

  if (searching && filtering) {
    return { label: "Clear search and filters", patch: CLEAR_ALL };
  }

  return searching
    ? { label: "Clear search", patch: CLEAR_SEARCH }
    : { label: "Clear filters", patch: CLEAR_FILTERS };
}

export function dateRangeError(from: string, to: string): string | null {
  return from !== "" && to !== "" && to < from
    ? "End date can't be before the start date."
    : null;
}

export function pageHref(params: ListParams, page: number): string {
  const search = toSearchParams({ ...params, page }).toString();

  return search === "" ? "/app" : `/app?${search}`;
}
