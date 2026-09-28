import { isValidDayIso } from "~/shared/utils/signing-date.utils";

export const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const;

export type PerPage = (typeof PER_PAGE_OPTIONS)[number];

export const DEFAULT_PER_PAGE: PerPage = 25;

export const MAX_PER_PAGE: PerPage = 100;

export const LIST_SORTS = ["created", "updated", "signed", "code"] as const;

export type ListSort = (typeof LIST_SORTS)[number];
export type SortDirection = "asc" | "desc";
export type Presence = "yes" | "no";

export type ListParams = {
  query: string;
  photo: Presence | null;
  video: Presence | null;
  signedFrom: string | null;
  signedTo: string | null;
  sort: ListSort;
  direction: SortDirection;
  view: "table" | "grid";
  page: number;
  perPage: PerPage;
};

export type ListPatchHandler = (patch: Partial<ListParams>) => void;

type RawParam = string | null | undefined;

export const DEFAULT_LIST_PARAMS: ListParams = {
  query: "",
  photo: null,
  video: null,
  signedFrom: null,
  signedTo: null,
  sort: "created",
  direction: "desc",
  view: "table",
  page: 1,
  perPage: DEFAULT_PER_PAGE,
};

export function defaultDirection(sort: ListSort): SortDirection {
  return sort === "code" ? "asc" : "desc";
}

export function parsePresence(value: RawParam): Presence | null {
  return value === "yes" || value === "no" ? value : null;
}

export function parseDay(value: RawParam): string | null {
  return typeof value === "string" && isValidDayIso(value) ? value : null;
}

export function parseSort(value: RawParam): ListSort | null {
  return LIST_SORTS.find((sort) => sort === value) ?? null;
}

export function parseDirection(value: RawParam): SortDirection | null {
  return value === "asc" || value === "desc" ? value : null;
}

export function parsePerPage(value: RawParam): PerPage {
  return (
    PER_PAGE_OPTIONS.find((option) => String(option) === value) ??
    DEFAULT_PER_PAGE
  );
}

function pageOrFirst(value: string | null): number {
  const page = value ?? "";

  return /^\d{1,6}$/.test(page) && Number(page) >= 1 ? Number(page) : 1;
}

// Never throws: anything invalid falls back to its default.
export function parseListParams(searchParams: URLSearchParams): ListParams {
  const sort = parseSort(searchParams.get("sort")) ?? DEFAULT_LIST_PARAMS.sort;
  const signedFrom = parseDay(searchParams.get("signedFrom"));
  const signedTo = parseDay(searchParams.get("signedTo"));
  const inverted =
    signedFrom !== null && signedTo !== null && signedTo < signedFrom;

  return {
    query: (searchParams.get("q") ?? "").slice(0, 100).trim(),
    photo: parsePresence(searchParams.get("photo")),
    video: parsePresence(searchParams.get("video")),
    signedFrom: inverted ? null : signedFrom,
    signedTo: inverted ? null : signedTo,
    sort,
    direction:
      parseDirection(searchParams.get("dir")) ?? defaultDirection(sort),
    view: searchParams.get("view") === "grid" ? "grid" : "table",
    page: pageOrFirst(searchParams.get("page")),
    perPage: parsePerPage(searchParams.get("perPage")),
  };
}

export function toSearchParams(params: ListParams): URLSearchParams {
  const entries: [string, string | null][] = [
    ["q", params.query || null],
    ["photo", params.photo],
    ["video", params.video],
    ["signedFrom", params.signedFrom],
    ["signedTo", params.signedTo],
    ["sort", params.sort === DEFAULT_LIST_PARAMS.sort ? null : params.sort],
    [
      "dir",
      params.direction === defaultDirection(params.sort)
        ? null
        : params.direction,
    ],
    ["view", params.view === "grid" ? params.view : null],
    ["page", params.page > 1 ? String(params.page) : null],
    [
      "perPage",
      params.perPage === DEFAULT_PER_PAGE ? null : String(params.perPage),
    ],
  ];

  return new URLSearchParams(
    entries.filter((entry): entry is [string, string] => entry[1] !== null),
  );
}

export function hasActiveFilters(params: ListParams): boolean {
  return (
    params.photo !== null ||
    params.video !== null ||
    params.signedFrom !== null ||
    params.signedTo !== null
  );
}
