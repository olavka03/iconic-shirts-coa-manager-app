import type { DetailState } from "~/features/orders/types/order-detail.types";
import type {
  OrderPick,
  PickerOpen,
  PickerStep,
} from "~/features/orders/types/order-picker.types";
import type {
  OrderDetail,
  OrderRow,
} from "~/features/orders/types/orders.types";
import {
  itemsAnnouncement,
  pickerAnnouncement,
  shouldAutoSkip,
  type PickerView,
} from "./picker-view.utils";

export type PickerOrder = Extract<PickerOpen, { step: "items" }>["order"];
export type Target = { order: PickerOrder; row: OrderRow | null };
export type ItemsHeaderData = PickerOrder & { cancelled: boolean };

export const SETTLED: ReadonlySet<DetailState["status"]> = new Set([
  "ready",
  "missing",
  "error",
  "no_access",
]);

export function pickerOrderOf(row: OrderRow): PickerOrder {
  return {
    numericId: row.numericId,
    name: row.name,
    fulfillment: row.fulfillment,
    createdLabel: row.createdLabel,
  };
}

export function itemsHeaderOf(
  detail: OrderDetail | null,
  target: Target | null,
): ItemsHeaderData | null {
  if (detail !== null) {
    return {
      ...pickerOrderOf(detail.order),
      cancelled: detail.order.cancelled,
    };
  }

  return target === null
    ? null
    : { ...target.order, cancelled: target.row?.cancelled ?? false };
}

export function autoPick(detail: OrderDetail): OrderPick | null {
  const item = shouldAutoSkip(detail, "orders");

  return item === null ? null : { order: detail.order, item, detail };
}

export function liveMessage(
  step: PickerStep,
  state: DetailState,
  openingRow: OrderRow | null,
  view: PickerView,
): string | null {
  if (step === "items") {
    return state.status === "ready" ? itemsAnnouncement(state.detail) : null;
  }

  return openingRow !== null
    ? `Loading order ${openingRow.name}`
    : pickerAnnouncement(view);
}
