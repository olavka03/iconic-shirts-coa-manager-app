import type { Ref } from "react";
import type { LineItemValue, OrderCard, OrderValue } from "./orders.types";
import type { PickerOpen } from "./order-picker.types";

export type OrderSectionProps = {
  kind: "create" | "duplicate" | "edit";
  order: OrderValue | null;
  lineItem: LineItemValue | null;
  orderCard: OrderCard | null;
  productImageUrl: string | null;
  orderError: string | null;
  lineItemError: string | null;
  filledLine: string | null;
  onOpenPicker(open: PickerOpen): void;
  changeOrderRef?: Ref<HTMLElement>;
  selectOrderRef?: Ref<HTMLElement>;
};
