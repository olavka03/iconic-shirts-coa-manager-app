export type PageSkeletonKind =
  { page: "index"; view: "table" | "grid" } | { page: "certificate" };

type PageLocation = { pathname: string; search: string };

const INDEX_PATHS = new Set(["/app", "/app/certificates"]);
const CERTIFICATE_PATH = /^\/app\/certificates\/[^/]+$/;

function withoutTrailingSlash(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

// Only a new page gets a skeleton; a new search on the same page keeps that page and its loading state.
export function pageSkeletonFor(
  current: PageLocation,
  target: PageLocation | undefined,
): PageSkeletonKind | null {
  if (target === undefined) {
    return null;
  }

  const pathname = withoutTrailingSlash(target.pathname);

  if (pathname === withoutTrailingSlash(current.pathname)) {
    return null;
  }

  if (INDEX_PATHS.has(pathname)) {
    const view = new URLSearchParams(target.search).get("view");

    return { page: "index", view: view === "grid" ? "grid" : "table" };
  }

  return CERTIFICATE_PATH.test(pathname) ? { page: "certificate" } : null;
}
