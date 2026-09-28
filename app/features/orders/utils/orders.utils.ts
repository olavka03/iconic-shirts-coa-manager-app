// Order-name symbols come only from Shop.orderNumberFormatPrefix through orderNameSymbols(); no
// symbol is hard-coded here.

export function orderToken(
  orderName: string | null | undefined,
): string | null {
  // Only the digits of the order name go into certificate codes (user decision): #141909 → 141909.
  const digits = (orderName ?? "").replace(/[^0-9]/g, "");

  return digits.length > 0 ? digits : null;
}

const ORDER_TERM = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export function normalizeOrderSearch(input: string): string | null {
  const term = input
    .replace(/\s+/g, "")
    .replace(/^[^A-Za-z0-9]+/, "")
    .toUpperCase();

  return term.length <= 20 && ORDER_TERM.test(term) ? term : null;
}

export function orderNameSymbols(formatPrefix: string): string {
  return /^[^\p{L}\p{N}]*/u.exec(formatPrefix)?.[0] ?? "";
}

// Characters that would change the meaning of a Shopify search query.
const UNSAFE_SYMBOLS = /[\\:()"'\s]/;
const ALL_STATUSES = "status:open OR status:closed OR status:cancelled";

export function orderSearchQuery(
  term: string | null,
  symbols: string,
  options: { allStatuses?: boolean } = {},
): string | null {
  if (term === null) {
    return options.allStatuses ? ALL_STATUSES : null;
  }

  const names =
    symbols !== "" && !UNSAFE_SYMBOLS.test(symbols)
      ? `name:${term} OR name:${symbols}${term}`
      : `name:${term}`;

  return options.allStatuses ? `(${ALL_STATUSES}) AND (${names})` : names;
}

export function rankOrderMatches<Order extends { name: string }>(
  rows: Order[],
  term: string,
): Order[] {
  const wantedToken = orderToken(term);
  const exact =
    wantedToken === null
      ? []
      : rows.filter((row) => orderToken(row.name) === wantedToken);

  return exact.length > 0 ? exact : rows;
}

export function filterRecentOrders<Order extends { name: string }>(
  rows: Order[],
  term: string,
): Order[] {
  const wantedToken = orderToken(term);

  if (wantedToken === null) {
    return rows;
  }

  return rows.filter((row) =>
    (orderToken(row.name) ?? "").startsWith(wantedToken),
  );
}

export function orderNumericId(gid: string): string | null {
  return /^gid:\/\/shopify\/Order\/(\d+)$/.exec(gid)?.[1] ?? null;
}
