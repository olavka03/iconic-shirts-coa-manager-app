import type { PickerOpen } from "~/features/orders/types/order-picker.types";
import type { OrderSectionProps } from "~/features/orders/types/order-section.types";
import type {
  OrderCard,
  OrderValue,
} from "~/features/orders/types/orders.types";
import { orderNumericId } from "./orders.utils";

export const ORDER_SECTION = {
  empty: "O1",
  emptyWithError: "O2",
  live: "O3",
  itemRemoved: "O3b",
  savedOnly: "O4",
  itemRejected: "O5",
  legacyNamed: "O6",
  legacyUnnamed: "O7",
} as const;

export type OrderSectionState =
  (typeof ORDER_SECTION)[keyof typeof ORDER_SECTION];

export function orderSectionState({
  kind,
  order,
  orderCard,
  orderError,
  lineItemError,
}: OrderSectionProps): OrderSectionState {
  // On edit a certificate without any order link or name comes back as order: null.
  if (order === null) {
    if (kind === "edit") {
      return ORDER_SECTION.legacyUnnamed;
    }

    return orderError !== null
      ? ORDER_SECTION.emptyWithError
      : ORDER_SECTION.empty;
  }

  if (order.id === null) {
    return order.name !== null
      ? ORDER_SECTION.legacyNamed
      : ORDER_SECTION.legacyUnnamed;
  }

  if (lineItemError !== null) {
    return ORDER_SECTION.itemRejected;
  }

  if (orderCard === null) {
    return ORDER_SECTION.savedOnly;
  }

  return orderCard.lineItem === null
    ? ORDER_SECTION.itemRemoved
    : ORDER_SECTION.live;
}

export function isLiveOrder(state: OrderSectionState): boolean {
  return state === ORDER_SECTION.live || state === ORDER_SECTION.itemRemoved;
}

export function showsChangeItem(
  state: OrderSectionState,
  orderCard: OrderCard | null,
): boolean {
  const selectable = orderCard?.selectableItems ?? 0;

  return (
    state === ORDER_SECTION.itemRejected ||
    (state === ORDER_SECTION.live && selectable > 1) ||
    (state === ORDER_SECTION.itemRemoved && selectable >= 1)
  );
}

export function itemsPickerOpen(
  order: OrderValue,
  orderCard: OrderCard | null,
): PickerOpen {
  const numericId = order.id === null ? null : orderNumericId(order.id);

  if (numericId === null) {
    return { step: "orders" };
  }

  return {
    step: "items",
    order: {
      numericId,
      name: order.name ?? "",
      fulfillment: orderCard?.fulfillment ?? null,
      createdLabel: orderCard?.createdLabel ?? null,
    },
  };
}
