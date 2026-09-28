import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  pickerView,
  type LoadFailure,
  type PickerView,
  type SearchState,
} from "~/features/orders/utils/picker-view.utils";
import type {
  OrderRow,
  OrdersListResponse,
} from "~/features/orders/types/orders.types";
import { normalizeOrderSearch } from "~/features/orders/utils/orders.utils";
import { loadFailureOf } from "~/features/orders/utils/order-requests.utils";
import {
  isNetworkFailure,
  requestJson,
  type JsonResult,
} from "~/shared/utils/json-request.utils";

const SEARCH_DELAY_MS = 300;

type SearchFailure = { reason: LoadFailure; term: string };
type ListOutcome =
  | { ok: true; orders: OrderRow[]; more: boolean }
  | { ok: false; reason: LoadFailure };

function toOutcome(response: JsonResult<OrdersListResponse>): ListOutcome {
  if (isNetworkFailure(response)) {
    return { ok: false, reason: "error" };
  }

  if (!response.ok) {
    return { ok: false, reason: loadFailureOf(response) };
  }

  return response;
}

function isRunning(controller: AbortController | null): boolean {
  return controller !== null && !controller.signal.aborted;
}

// Both can run at once (Link order). pickerView only needs the recent load when no search runs.
function pendingKind(
  recentPending: boolean,
  searchPending: boolean,
): SearchState["pending"] {
  if (searchPending) {
    return "search";
  }

  return recentPending ? "recent" : null;
}

export function useOrderSearch(options: { prefetch: boolean }): {
  query: string;
  setQuery(query: string): void;
  submit(): void;
  retry(): void;
  refreshRecent(): void;
  view: PickerView;
  ensureRecent(): void;
} {
  const [query, setQueryValue] = useState("");
  const [recent, setRecent] = useState<OrderRow[] | null>(null);
  const [results, setResults] = useState<SearchState["results"]>(null);
  const [recentPending, setRecentPending] = useState(false);
  const [searchPending, setSearchPending] = useState(false);
  const [recentFailure, setRecentFailure] = useState<LoadFailure | null>(null);
  const [searchFailure, setSearchFailure] = useState<SearchFailure | null>(
    null,
  );
  // The picker's prepare() calls setQuery and submit in the same tick, so these reads can't wait for a render.
  const queryRef = useRef("");
  const hasRecent = useRef(false);
  const resultsTerm = useRef<string | null>(null);
  const recentRequest = useRef<AbortController | null>(null);
  const searchRequest = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadRecent = useCallback(async (background: boolean) => {
    recentRequest.current?.abort();

    const controller = new AbortController();

    recentRequest.current = controller;
    setRecentPending(true);

    if (!background) {
      setRecentFailure(null);
    }

    const response = await requestJson<OrdersListResponse>("/api/orders", {
      signal: controller.signal,
    });

    if (controller.signal.aborted) {
      return;
    }

    const outcome = toOutcome(response);

    recentRequest.current = null;
    setRecentPending(false);

    if (outcome.ok) {
      hasRecent.current = true;
      setRecent(outcome.orders);

      return;
    }

    // A failed background refresh keeps the rows already shown.
    if (!background) {
      setRecentFailure(outcome.reason);
    }
  }, []);

  const search = useCallback(async (term: string) => {
    searchRequest.current?.abort();

    const controller = new AbortController();

    searchRequest.current = controller;
    setSearchPending(true);
    setSearchFailure(null);

    const response = await requestJson<OrdersListResponse>(
      `/api/orders?q=${encodeURIComponent(term)}`,
      { signal: controller.signal },
    );

    if (controller.signal.aborted) {
      return;
    }

    const outcome = toOutcome(response);

    searchRequest.current = null;
    setSearchPending(false);

    if (outcome.ok) {
      resultsTerm.current = term;
      setResults({ term, rows: outcome.orders, more: outcome.more });

      return;
    }

    setSearchFailure({ reason: outcome.reason, term });
  }, []);

  const stopSearch = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }

    searchRequest.current?.abort();
    searchRequest.current = null;
    setSearchPending(false);
  }, []);

  const ensureRecent = useCallback(() => {
    if (!hasRecent.current && !isRunning(recentRequest.current)) {
      void loadRecent(false);
    }
  }, [loadRecent]);

  const refreshRecent = useCallback(() => {
    if (hasRecent.current && !isRunning(recentRequest.current)) {
      void loadRecent(true);
    }
  }, [loadRecent]);

  const setQuery = useCallback(
    (nextQuery: string) => {
      const term = normalizeOrderSearch(nextQuery);

      queryRef.current = nextQuery;
      setQueryValue(nextQuery);
      stopSearch();
      setSearchFailure(null);

      if (nextQuery.trim() === "") {
        ensureRecent();
      }

      if (term === null || term === resultsTerm.current) {
        return;
      }

      // Pending from the first keystroke, so the pause before the request never reads as "no results".
      setSearchPending(true);
      timer.current = setTimeout(() => {
        timer.current = null;
        void search(term);
      }, SEARCH_DELAY_MS);
    },
    [ensureRecent, search, stopSearch],
  );

  const submit = useCallback(() => {
    const term = normalizeOrderSearch(queryRef.current);

    if (term === null) {
      return;
    }

    const searchAlreadyCurrent =
      timer.current === null &&
      (isRunning(searchRequest.current) || resultsTerm.current === term);

    if (!searchAlreadyCurrent) {
      stopSearch();
      void search(term);
    }
  }, [search, stopSearch]);

  const retry = useCallback(() => {
    if (recentFailure !== null) {
      void loadRecent(false);
    }

    if (searchFailure !== null) {
      void search(searchFailure.term);
    }
  }, [recentFailure, searchFailure, loadRecent, search]);

  useEffect(() => {
    if (options.prefetch) {
      ensureRecent();
    }
  }, [options.prefetch, ensureRecent]);

  useEffect(
    () => () => {
      recentRequest.current?.abort();
      recentRequest.current = null;
      stopSearch();
    },
    [stopSearch],
  );

  const view = useMemo(
    () =>
      pickerView(
        {
          recent,
          results,
          pending: pendingKind(recentPending, searchPending),
          recentFailure,
          searchFailure: searchFailure?.reason ?? null,
        },
        query,
      ),
    [
      recent,
      results,
      recentPending,
      searchPending,
      recentFailure,
      searchFailure,
      query,
    ],
  );

  return {
    query,
    setQuery,
    submit,
    retry,
    refreshRecent,
    view,
    ensureRecent,
  };
}
