import type {
  OrderDetail,
  OrderItemRow,
  OrderRow,
} from "~/features/orders/types/orders.types";
import {
  filterRecentOrders,
  normalizeOrderSearch,
  orderToken,
} from "./orders.utils";
import { pluralize } from "~/shared/utils/format.utils";

export type LoadFailure = "error" | "no_access";

export type SearchState = {
  recent: OrderRow[] | null;
  results: { term: string; rows: OrderRow[]; more: boolean } | null;
  pending: "recent" | "search" | null;
  recentFailure: LoadFailure | null;
  searchFailure: LoadFailure | null;
};

export type PickerView = {
  kind:
    | "loading"
    | "recent"
    | "searching"
    | "results"
    | "partial"
    | "no_results"
    | "no_orders"
    | "error"
    | "no_access";
  header: string;
  rows: OrderRow[];
  hint: string | null;
  exactMatch: OrderRow | null;
  emptyText: string | null;
};

export type ItemStatus = {
  selectable: boolean;
  badge: { label: string; tone: "info" | "success" | "auto" } | null;
  text: string | null;
};

const RECENT_HEADER = "Recent orders";
const WINDOW_NOTE = "Orders placed more than 60 days ago can't be selected.";
const SELECTED_BADGE = { label: "Selected", tone: "info" } as const;

function buildView(
  kind: PickerView["kind"],
  fields: Partial<Omit<PickerView, "kind">> = {},
): PickerView {
  return {
    kind,
    header: "",
    rows: [],
    hint: null,
    exactMatch: null,
    emptyText: null,
    ...fields,
  };
}

function exactMatchOf(rows: OrderRow[], query: string): OrderRow | null {
  const wanted = orderToken(query);
  const matches =
    wanted === null
      ? []
      : rows.filter((row) => orderToken(row.name) === wanted);

  return matches.length === 1 ? matches[0] : null;
}

function noResultsText(newest: OrderRow | undefined): string {
  return newest
    ? `Check the number and enter it in full, for example ${newest.name}. ${WINDOW_NOTE}`
    : `Check the number and enter it in full. ${WINDOW_NOTE}`;
}

function recentListView(state: SearchState): PickerView {
  if (state.recent === null && state.pending === "recent") {
    return buildView("loading");
  }

  if (state.recentFailure !== null) {
    return buildView(state.recentFailure);
  }

  // Never requested yet: a hidden picker on edit must not claim there are no orders.
  if (state.recent === null) {
    return buildView("loading");
  }

  return state.recent.length > 0
    ? buildView("recent", { header: RECENT_HEADER, rows: state.recent })
    : buildView("no_orders", {
        header: "No orders in the last 60 days",
        emptyText: WINDOW_NOTE,
      });
}

function searchView(state: SearchState, query: string): PickerView {
  const term = normalizeOrderSearch(query);

  if (state.searchFailure !== null) {
    return buildView(state.searchFailure);
  }

  // Text that can't be searched sends no request, so the list's failure is still the answer.
  if (term === null && state.recentFailure !== null) {
    return buildView(state.recentFailure);
  }

  const filtered = filterRecentOrders(state.recent ?? [], query);

  if (term !== null && state.pending === "search") {
    return state.recent === null
      ? buildView("loading")
      : buildView("searching", { header: RECENT_HEADER, rows: filtered });
  }

  const results =
    term !== null && state.results?.term === term ? state.results : null;

  if (results !== null && results.rows.length > 0) {
    return buildView("results", {
      header: results.more
        ? `${results.rows.length} most recent matches`
        : pluralize(results.rows.length, "order"),
      rows: results.rows,
      exactMatch: exactMatchOf(results.rows, query),
    });
  }

  // The first list still decides between matching recent rows and no results.
  if (state.recent === null && state.pending === "recent") {
    return buildView("loading");
  }

  if (filtered.length > 0) {
    return buildView("partial", {
      header: RECENT_HEADER,
      rows: filtered,
      hint: "Enter the full order number to search all orders.",
    });
  }

  return buildView("no_results", {
    header: "No orders found",
    emptyText: noResultsText(state.recent?.[0]),
  });
}

export function pickerView(state: SearchState, query: string): PickerView {
  return query.trim() === "" ? recentListView(state) : searchView(state, query);
}

const ANNOUNCED: ReadonlySet<PickerView["kind"]> = new Set([
  "recent",
  "partial",
  "results",
  "no_results",
  "no_orders",
]);

export function pickerAnnouncement(view: PickerView): string | null {
  return ANNOUNCED.has(view.kind) ? view.header : null;
}

export function itemsAnnouncement(detail: OrderDetail): string {
  return `Select item. Order ${detail.order.name}, ${pluralize(detail.lineItems.length, "item")}.`;
}

function selectedItemText(row: OrderItemRow): string {
  if (row.state === "removed") {
    return "This item is no longer in the order.";
  }

  return row.quantity === 1
    ? "Certificate created"
    : `${row.certificates.length + 1} of ${row.quantity} certificates created, including this one`;
}

export function itemStatus(row: OrderItemRow): ItemStatus {
  const created = row.certificates.length;
  const quantity = row.quantity;

  if (row.includesThis) {
    return {
      selectable: true,
      badge: SELECTED_BADGE,
      text: selectedItemText(row),
    };
  }

  if (row.state === "removed") {
    return {
      selectable: false,
      badge: { label: "Refunded or removed", tone: "auto" },
      text: null,
    };
  }

  if (row.state === "complete") {
    return quantity > 1
      ? {
          selectable: false,
          badge: { label: "All certificates created", tone: "success" },
          text: `${quantity} of ${quantity} certificates created`,
        }
      : {
          selectable: false,
          badge: { label: "Certificate created", tone: "success" },
          text: null,
        };
  }

  return {
    selectable: true,
    badge: null,
    text: created > 0 ? `${created} of ${quantity} certificates created` : null,
  };
}

function hasAnyCertificate(detail: OrderDetail): boolean {
  return (
    detail.orderCertificates.length > 0 ||
    detail.legacyCertificates.length > 0 ||
    detail.lineItems.some(
      (lineItem) =>
        lineItem.includesThis ||
        lineItem.certificates.length > 0 ||
        lineItem.possibleCertificates.length > 0,
    )
  );
}

export function shouldAutoSkip(
  detail: OrderDetail,
  mode: "orders" | "items",
): OrderItemRow | null {
  if (mode === "items" || hasAnyCertificate(detail)) {
    return null;
  }

  const selectable = detail.lineItems.filter(
    (lineItem) => itemStatus(lineItem).selectable,
  );

  return selectable.length === 1 ? selectable[0] : null;
}

export function orderRowLabel(row: OrderRow, selected = false): string {
  return [
    `Order ${row.name}`,
    row.createdLabel,
    row.cancelled ? "Canceled" : null,
    row.fulfillment.label,
    pluralize(row.itemCount, "item"),
    row.certificateCount > 0
      ? pluralize(row.certificateCount, "certificate")
      : null,
    selected ? "selected" : null,
  ]
    .filter((part) => part !== null)
    .join(", ");
}

export function orderRowFacts(row: OrderRow): string {
  return [
    row.createdLabel,
    pluralize(row.itemCount, "item"),
    row.certificateCount > 0
      ? pluralize(row.certificateCount, "certificate")
      : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");
}

export function itemRowLabel(row: OrderItemRow): string {
  return [
    row.title,
    row.variantTitle,
    `quantity ${row.quantity}`,
    itemStatus(row).text?.replace(/\.$/, "") ?? null,
    row.includesThis ? "selected" : null,
  ]
    .filter((part) => part !== null && part !== "")
    .join(", ");
}

export function variantQuantityLine(
  variantTitle: string | null,
  quantity: number,
): string | null {
  const parts = [variantTitle, quantity > 1 ? `Quantity ${quantity}` : null];
  const line = parts.filter((part) => part !== null && part !== "").join(" · ");

  return line === "" ? null : line;
}
