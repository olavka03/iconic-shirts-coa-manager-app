// No customer data is ever requested, stored or returned.
import {
  isAdminApiError,
  type AdminContext,
} from "~/.server/gateways/admin-graphql.gateway";
import {
  getOrderLineItems,
  listOrders,
  type OrderWithItems,
} from "~/.server/gateways/orders.gateway";
import type {
  OrderCard,
  OrderDetail,
  OrderRow,
} from "~/features/orders/types/orders.types";
import type {
  CertificateReference,
  FieldErrors,
} from "~/shared/types/api.types";
import { matchLegacyToItems } from "~/features/codes/utils/legacy-match.utils";
import {
  normalizeOrderSearch,
  orderNameSymbols,
  orderSearchQuery,
  orderToken,
  rankOrderMatches,
} from "~/features/orders/utils/orders.utils";
import { log } from "~/.server/logging/logger.service";
import { codesContaining } from "~/.server/repositories/certificate-codes.repository";
import type { CertificateWrite } from "~/.server/repositories/certificate.types";
import {
  certificatesByLineItems,
  certificatesForOrder,
  countByOrders,
  getOrderLink,
} from "~/.server/repositories/order-links.repository";
import { getCodeDictionary } from "~/.server/services/codes/codes.service";
import {
  ADMIN_READ_BUDGET_MS,
  budgetSignal,
  failureKind,
  rethrowAuth,
} from "~/.server/services/shared/admin-read.utils";
import {
  getShopInfo,
  shopTimeZone,
} from "~/.server/services/shop/shop-info.service";
import {
  itemSummaryOf,
  toOrderCard,
  toOrderCertificateReference,
  toOrderItemRow,
  toOrderRow,
} from "./order-views.utils";

export type StoredLink = Pick<
  CertificateWrite,
  "orderId" | "orderName" | "lineItemId" | "lineItemTitle"
>;

export type OrderLinkResult =
  | { ok: true; link: StoredLink; capacity: number | null }
  | { ok: false; fieldErrors: FieldErrors };

type ReadOptions = { signal?: AbortSignal };

const NO_LINK: StoredLink = {
  orderId: null,
  orderName: null,
  lineItemId: null,
  lineItemTitle: null,
};
const ITEM_GONE = "This item is no longer in the order. Select another item.";

const toCertificateReference = ({
  id,
  code,
}: CertificateReference): CertificateReference => ({
  id,
  code,
});

export async function listPickerOrders(
  context: AdminContext,
  rawQuery: string,
  options: ReadOptions = {},
): Promise<{ orders: OrderRow[]; more: boolean }> {
  const trimmedQuery = rawQuery.trim();
  const term = trimmedQuery === "" ? null : normalizeOrderSearch(trimmedQuery);

  if (trimmedQuery !== "" && term === null) {
    return { orders: [], more: false };
  }

  const shopInfo = await getShopInfo(context, options);
  const query =
    term === null
      ? null
      : orderSearchQuery(
          term,
          shopInfo ? orderNameSymbols(shopInfo.orderNumberFormatPrefix) : "",
        );
  const { orders, hasNextPage } = await listOrders(
    context.admin,
    { query },
    { signal: options.signal },
  );
  const ranked = term === null ? orders : rankOrderMatches(orders, term);
  const certificateCounts = await countByOrders(
    context.shop,
    ranked.map((order) => ({ id: order.id, name: order.name })),
  );
  const timeZone = shopTimeZone(shopInfo);

  return {
    orders: ranked.map((order) =>
      toOrderRow(order, {
        itemCount: order.currentSubtotalLineItemsQuantity,
        itemSummary: itemSummaryOf(order.lineItems),
        certificateCount: certificateCounts.get(order.id) ?? 0,
        timeZone,
      }),
    ),
    more: hasNextPage && ranked.length === orders.length,
  };
}

async function readPickerData(
  context: AdminContext,
  order: OrderWithItems,
  excludeId: string | undefined,
  options: ReadOptions,
) {
  const token = orderToken(order.name);
  const [
    certificatesByItem,
    orderCertificates,
    takenCodes,
    dictionary,
    excludedLink,
    certificateCounts,
    shopInfo,
  ] = await Promise.all([
    certificatesByLineItems(
      context.shop,
      order.lineItems.map((item) => item.id),
      excludeId,
    ),
    certificatesForOrder(
      context.shop,
      { orderId: order.id, orderName: order.name },
      excludeId,
    ),
    token === null ? [] : codesContaining(context.shop, token, excludeId),
    getCodeDictionary(context),
    excludeId === undefined ? null : getOrderLink(context.shop, excludeId),
    countByOrders(context.shop, [{ id: order.id, name: order.name }]),
    getShopInfo(context, options),
  ]);

  return {
    certificatesByItem,
    orderCertificates,
    takenCodes,
    dictionary,
    excludedLink,
    certificateCounts,
    shopInfo,
  };
}

export async function getPickerOrder(
  context: AdminContext,
  orderId: string,
  excludeId?: string,
  options: ReadOptions = {},
): Promise<OrderDetail | null> {
  const order = await getOrderLineItems(context.admin, orderId, {
    signal: options.signal,
  });

  if (!order) {
    return null;
  }

  const {
    certificatesByItem,
    orderCertificates,
    takenCodes,
    dictionary,
    excludedLink,
    certificateCounts,
    shopInfo,
  } = await readPickerData(context, order, excludeId, options);
  const legacyRows = orderCertificates.filter(
    (certificate) => certificate.orderId === null,
  );
  const matchedItemIds = matchLegacyToItems(
    legacyRows,
    order.lineItems,
    dictionary,
  );
  const legacyMatchesOf = (lineItemId: string) =>
    legacyRows
      .filter(
        (certificate) => matchedItemIds.get(certificate.id) === lineItemId,
      )
      .map(toCertificateReference);
  const orderedQuantity = order.lineItems.reduce(
    (total, item) => total + item.currentQuantity,
    0,
  );

  return {
    order: toOrderRow(order, {
      itemCount: orderedQuantity,
      itemSummary: itemSummaryOf(order.lineItems),
      certificateCount: certificateCounts.get(order.id) ?? 0,
      timeZone: shopTimeZone(shopInfo),
    }),
    lineItems: order.lineItems.map((item) =>
      toOrderItemRow(item, {
        certificates: certificatesByItem.get(item.id) ?? [],
        possibleCertificates: legacyMatchesOf(item.id),
        includesThis: excludedLink?.lineItemId === item.id,
      }),
    ),
    legacyCertificates: legacyRows
      .filter((certificate) => !matchedItemIds.has(certificate.id))
      .map(toCertificateReference),
    orderCertificates: orderCertificates.map(toOrderCertificateReference),
    takenCodes,
  };
}

export async function getOrderCard(
  context: AdminContext,
  link: { orderId: string; lineItemId: string },
  options: { signal: AbortSignal },
): Promise<OrderCard | null> {
  try {
    const [order, shopInfo] = await Promise.all([
      getOrderLineItems(context.admin, link.orderId, {
        signal: options.signal,
      }),
      getShopInfo(context, options),
    ]);

    if (order) {
      return toOrderCard(order, link.lineItemId, shopTimeZone(shopInfo));
    }

    log.warn("orders.card_unavailable", {
      shop: context.shop,
      kind: "not_found",
    });
  } catch (error) {
    rethrowAuth(error);
    log.warn("orders.card_unavailable", {
      shop: context.shop,
      kind: failureKind(error),
    });
  }

  return null;
}

// null when Shopify has no such order or can't be read: the save goes on unchecked (spec §4.6).
async function readOrderForLink(
  context: AdminContext,
  orderId: string,
  options: ReadOptions,
): Promise<OrderWithItems | null> {
  try {
    return await getOrderLineItems(context.admin, orderId, {
      signal: budgetSignal(ADMIN_READ_BUDGET_MS, options.signal),
    });
  } catch (error) {
    rethrowAuth(error);

    if (!isAdminApiError(error)) {
      throw error;
    }

    log.warn("orders.link_unverified", {
      shop: context.shop,
      kind: error.kind,
    });

    return null;
  }
}

export async function resolveOrderLink(
  context: AdminContext,
  input: {
    order: { id: string; name: string } | null;
    lineItem: { id: string; title: string } | null;
  },
  previous: StoredLink | null,
  options: ReadOptions = {},
): Promise<OrderLinkResult> {
  const { order, lineItem } = input;

  // The schema posts both or neither; neither keeps the stored columns, a legacy name included.
  if (!order || !lineItem) {
    return { ok: true, link: previous ?? NO_LINK, capacity: null };
  }

  if (previous?.lineItemId === lineItem.id) {
    return { ok: true, link: previous, capacity: null };
  }

  const liveOrder = await readOrderForLink(context, order.id, options);

  if (!liveOrder) {
    return {
      ok: true,
      link: {
        orderId: order.id,
        orderName: order.name,
        lineItemId: lineItem.id,
        lineItemTitle: lineItem.title,
      },
      capacity: null,
    };
  }

  const item = liveOrder.lineItems.find(
    (candidate) =>
      candidate.id === lineItem.id && candidate.currentQuantity > 0,
  );

  if (!item) {
    return { ok: false, fieldErrors: { lineItem: ITEM_GONE } };
  }

  return {
    ok: true,
    link: {
      orderId: liveOrder.id,
      orderName: liveOrder.name,
      lineItemId: item.id,
      lineItemTitle: item.title,
    },
    capacity: item.currentQuantity,
  };
}
