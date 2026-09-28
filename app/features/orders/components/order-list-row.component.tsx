import type { OrderRow } from "~/features/orders/types/orders.types";
import {
  orderRowLabel,
  orderRowFacts,
} from "~/features/orders/utils/picker-view.utils";

export type OrderListRowProps = {
  row: OrderRow;
  opening: boolean;
  selected: boolean;
  onOpen(row: OrderRow): void;
};

export function OrderListRow({
  row,
  opening,
  selected,
  onOpen,
}: OrderListRowProps) {
  return (
    <s-clickable
      border="base"
      borderStyle="solid none none none"
      paddingInline="base"
      paddingBlock="small"
      loading={opening || undefined}
      accessibilityLabel={orderRowLabel(row, selected)}
      onClick={() => onOpen(row)}
    >
      <s-stack gap="small-300">
        <s-stack direction="inline" gap="small-200" alignItems="center">
          <s-text type="strong">{row.name}</s-text>
          {row.cancelled && <s-badge>Canceled</s-badge>}
          <s-badge tone={row.fulfillment.tone}>{row.fulfillment.label}</s-badge>
          {selected && <s-badge tone="info">Selected</s-badge>}
          {opening && (
            <s-spinner
              size="base"
              accessibilityLabel={`Loading order ${row.name}`}
            />
          )}
        </s-stack>
        <s-text color="subdued">{orderRowFacts(row)}</s-text>
        {row.itemSummary !== "" && (
          <s-paragraph color="subdued" lineClamp={1}>
            {row.itemSummary}
          </s-paragraph>
        )}
      </s-stack>
    </s-clickable>
  );
}
