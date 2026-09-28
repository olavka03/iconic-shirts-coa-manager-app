import type {
  OrderLineItemNode,
  OrderWithItems,
} from "~/.server/gateways/orders.gateway";
import type {
  FulfillmentBadge,
  OrderCard,
  OrderCertificateReference,
  OrderItemRow,
  OrderRow,
} from "~/features/orders/types/orders.types";
import type { CertificateReference } from "~/shared/types/api.types";
import { formatOrderTime } from "~/shared/utils/format.utils";
import { orderNumericId } from "~/features/orders/utils/orders.utils";
import { signerSummary } from "~/features/signers/utils/signer-text.utils";
import type { OrderCertificateRow } from "~/.server/repositories/order-links.repository";
import type { OrderDisplayFulfillmentStatus } from "~/types/admin.types";

// A new API value that isn't mapped here fails tsc on the next codegen (spec §6.4.9).
export const FULFILLMENT: Record<string, FulfillmentBadge> = {
  UNFULFILLED: { label: "Unfulfilled", tone: "caution" },
  PARTIALLY_FULFILLED: { label: "Partially fulfilled", tone: "warning" },
  FULFILLED: { label: "Fulfilled", tone: "auto" },
  IN_PROGRESS: { label: "In progress", tone: "caution" },
  OPEN: { label: "Open", tone: "caution" },
  PENDING_FULFILLMENT: { label: "Pending fulfillment", tone: "caution" },
  ON_HOLD: { label: "On hold", tone: "warning" },
  SCHEDULED: { label: "Scheduled", tone: "info" },
  REQUEST_DECLINED: { label: "Request declined", tone: "critical" },
  RESTOCKED: { label: "Restocked", tone: "auto" },
} satisfies Record<OrderDisplayFulfillmentStatus, FulfillmentBadge>;

function sentenceCase(value: string): string {
  const words = value.toLowerCase().replace(/_/g, " ");

  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function fulfillmentBadge(status: string): FulfillmentBadge {
  return Object.hasOwn(FULFILLMENT, status)
    ? FULFILLMENT[status]
    : { label: sentenceCase(status), tone: "auto" };
}

export function toOrderCertificateReference(
  row: OrderCertificateRow,
): OrderCertificateReference {
  return {
    id: row.id,
    code: row.code,
    signers: signerSummary(row.signerNames),
    item: row.item,
    lineItemId: row.lineItemId,
  };
}

export function toOrderRow(
  order: {
    id: string;
    name: string;
    createdAt: string;
    cancelledAt: string | null;
    displayFulfillmentStatus: string;
  },
  details: {
    itemCount: number;
    itemSummary: string;
    certificateCount: number;
    timeZone: string;
  },
): OrderRow {
  return {
    id: order.id,
    numericId: orderNumericId(order.id) ?? "",
    name: order.name,
    createdLabel: formatOrderTime(order.createdAt, details.timeZone),
    fulfillment: fulfillmentBadge(order.displayFulfillmentStatus),
    cancelled: order.cancelledAt !== null,
    itemCount: details.itemCount,
    itemSummary: details.itemSummary,
    certificateCount: details.certificateCount,
  };
}

export function itemSummaryOf(
  lines: { title: string; currentQuantity: number; isGiftCard?: boolean }[],
): string {
  return lines
    .filter((line) => line.currentQuantity > 0 && !line.isGiftCard)
    .slice(0, 3)
    .map((line) => line.title)
    .join(", ");
}

function itemState(
  quantity: number,
  certificateCount: number,
): OrderItemRow["state"] {
  if (quantity === 0) {
    return "removed";
  }

  return certificateCount >= quantity ? "complete" : "open";
}

function lineItemImage(item: OrderLineItemNode): string | null {
  return item.imageUrl ?? item.product?.imageUrl ?? null;
}

export function toOrderItemRow(
  item: OrderLineItemNode,
  details: {
    certificates: CertificateReference[];
    possibleCertificates: CertificateReference[];
    includesThis: boolean;
  },
): OrderItemRow {
  return {
    id: item.id,
    title: item.title,
    variantTitle: item.variantTitle,
    quantity: item.currentQuantity,
    imageUrl: lineItemImage(item),
    product: item.product,
    certificates: details.certificates,
    possibleCertificates: details.possibleCertificates,
    includesThis: details.includesThis,
    state: itemState(item.currentQuantity, details.certificates.length),
  };
}

export function toOrderCard(
  order: OrderWithItems,
  lineItemId: string,
  timeZone: string,
): OrderCard {
  const selectableItems = order.lineItems.filter(
    (item) => item.currentQuantity > 0,
  );
  const linkedItem = selectableItems.find((item) => item.id === lineItemId);

  return {
    createdLabel: formatOrderTime(order.createdAt, timeZone),
    fulfillment: fulfillmentBadge(order.displayFulfillmentStatus),
    cancelled: order.cancelledAt !== null,
    selectableItems: selectableItems.length,
    lineItem: linkedItem
      ? {
          variantTitle: linkedItem.variantTitle,
          quantity: linkedItem.currentQuantity,
          imageUrl: lineItemImage(linkedItem),
        }
      : null,
  };
}
