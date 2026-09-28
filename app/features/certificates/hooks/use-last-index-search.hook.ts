import { useEffect, useState } from "react";

export const LAST_INDEX_SEARCH_KEY = "coa:lastIndexSearch";

// Storage access throws when the browser blocks site data for the embedded iframe.
export function writeLastIndexSearch(search: string): void {
  try {
    sessionStorage.setItem(LAST_INDEX_SEARCH_KEY, search);
  } catch {
    // The breadcrumb falls back to /app.
  }
}

export function readLastIndexSearch(): string {
  try {
    const stored = sessionStorage.getItem(LAST_INDEX_SEARCH_KEY);

    return stored?.startsWith("?") ? stored : "";
  } catch {
    return "";
  }
}

// The server can't see sessionStorage, so SSR and the first client render agree on /app.
export function useLastIndexHref(): string {
  const [href, setHref] = useState("/app");

  useEffect(() => {
    setHref(`/app${readLastIndexSearch()}`);
  }, []);

  return href;
}
