import type { PickerStep } from "~/features/orders/types/order-picker.types";
import type { OrderRow } from "~/features/orders/types/orders.types";
import {
  pickerOrderOf,
  type PickerOrder,
  type Target,
} from "~/features/orders/utils/order-picker.utils";

export type PickerStepState = { step: PickerStep; target: Target | null };

export type PickerStepAction =
  | { type: "backToOrders" }
  | { type: "openRow"; row: OrderRow }
  | { type: "loadItems"; order: PickerOrder }
  | { type: "showItems" };

export const ORDERS_STEP: PickerStepState = { step: "orders", target: null };

export function pickerStepReducer(
  state: PickerStepState,
  action: PickerStepAction,
): PickerStepState {
  switch (action.type) {
    case "backToOrders":
      return ORDERS_STEP;
    case "openRow":
      return {
        ...state,
        target: { order: pickerOrderOf(action.row), row: action.row },
      };
    case "loadItems":
      return { step: "items", target: { order: action.order, row: null } };
    case "showItems":
      return { ...state, step: "items" };
  }
}
