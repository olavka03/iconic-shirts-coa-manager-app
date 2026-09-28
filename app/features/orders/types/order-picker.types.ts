import type {
  FulfillmentBadge,
  OrderDetail,
  OrderItemRow,
  OrderRow,
} from "./orders.types";

export type PickerStep = "orders" | "items";

export type PickerOpen =
  | { step: "orders"; query?: string }
  | {
      step: "items";
      order: {
        numericId: string;
        name: string;
        fulfillment: FulfillmentBadge | null;
        createdLabel: string | null;
      };
    };

export type OrderPick = {
  order: OrderRow;
  item: OrderItemRow;
  detail: OrderDetail;
};
