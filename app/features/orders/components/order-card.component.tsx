import { useButtonRef } from "~/features/orders/hooks/use-button-ref.hook";
import type { OrderSectionProps } from "~/features/orders/types/order-section.types";
import {
  isLiveOrder,
  itemsPickerOpen,
  ORDER_SECTION,
  showsChangeItem,
  type OrderSectionState,
} from "~/features/orders/utils/order-section-state.utils";
import { variantQuantityLine } from "~/features/orders/utils/picker-view.utils";
import type { OrderValue } from "~/features/orders/types/orders.types";
import { CriticalLine } from "./critical-line.component";

type OrderCardHeaderProps = { order: OrderValue; live: boolean } & Pick<
  OrderSectionProps,
  "orderCard" | "onOpenPicker" | "changeOrderRef"
>;

function OrderCardHeader({
  order,
  live,
  orderCard,
  onOpenPicker,
  changeOrderRef,
}: OrderCardHeaderProps) {
  const changeButtonRef = useButtonRef(changeOrderRef);

  return (
    <s-box padding="small">
      <s-grid gridTemplateColumns="1fr auto" gap="small" alignItems="center">
        <s-stack gap="small-300">
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-text type="strong">{order.name}</s-text>
            {orderCard?.cancelled && <s-badge>Canceled</s-badge>}
            {live && orderCard !== null && (
              <s-badge tone={orderCard.fulfillment.tone}>
                {orderCard.fulfillment.label}
              </s-badge>
            )}
          </s-stack>
          {live && orderCard !== null && (
            <s-text color="subdued">{orderCard.createdLabel}</s-text>
          )}
        </s-stack>
        <s-button
          id="change-order"
          ref={changeButtonRef}
          variant="tertiary"
          accessibilityLabel="Change order"
          commandFor="order-picker"
          command="--show"
          onClick={() => onOpenPicker({ step: "orders" })}
        >
          Change
        </s-button>
      </s-grid>
    </s-box>
  );
}

type OrderCardItemProps = {
  order: OrderValue;
  state: OrderSectionState;
} & Pick<
  OrderSectionProps,
  "orderCard" | "lineItem" | "productImageUrl" | "onOpenPicker"
>;

function OrderCardItem({
  order,
  state,
  orderCard,
  lineItem,
  productImageUrl,
  onOpenPicker,
}: OrderCardItemProps) {
  const cardLineItem = orderCard?.lineItem ?? null;
  const details =
    state === ORDER_SECTION.live && cardLineItem !== null
      ? variantQuantityLine(cardLineItem.variantTitle, cardLineItem.quantity)
      : null;

  return (
    <s-box padding="small">
      <s-grid
        gridTemplateColumns="auto 1fr auto"
        gap="small"
        alignItems="center"
      >
        <s-thumbnail
          size="small"
          src={cardLineItem?.imageUrl ?? productImageUrl ?? undefined}
          alt=""
        />
        <s-stack gap="small-300">
          {lineItem !== null && <s-text>{lineItem.title}</s-text>}
          {details !== null && <s-text color="subdued">{details}</s-text>}
          {state === ORDER_SECTION.itemRemoved && (
            <s-text color="subdued">
              This item is no longer in the order.
            </s-text>
          )}
        </s-stack>
        {showsChangeItem(state, orderCard) && (
          <s-button
            id="change-item"
            variant="tertiary"
            accessibilityLabel="Change item"
            commandFor="order-picker"
            command="--show"
            onClick={() => onOpenPicker(itemsPickerOpen(order, orderCard))}
          >
            Change
          </s-button>
        )}
      </s-grid>
    </s-box>
  );
}

type LinkedOrderProps = { order: OrderValue; state: OrderSectionState } & Pick<
  OrderSectionProps,
  | "orderCard"
  | "lineItem"
  | "productImageUrl"
  | "lineItemError"
  | "filledLine"
  | "onOpenPicker"
  | "changeOrderRef"
>;

export function LinkedOrder({
  order,
  state,
  orderCard,
  lineItem,
  productImageUrl,
  lineItemError,
  filledLine,
  onOpenPicker,
  changeOrderRef,
}: LinkedOrderProps) {
  return (
    <s-section heading="Order">
      <s-stack gap="small">
        <s-box border="base" borderRadius="base" overflow="hidden">
          <OrderCardHeader
            order={order}
            live={isLiveOrder(state)}
            orderCard={orderCard}
            onOpenPicker={onOpenPicker}
            changeOrderRef={changeOrderRef}
          />
          <s-divider />
          <OrderCardItem
            order={order}
            state={state}
            orderCard={orderCard}
            lineItem={lineItem}
            productImageUrl={productImageUrl}
            onOpenPicker={onOpenPicker}
          />
        </s-box>
        {filledLine !== null && <s-text color="subdued">{filledLine}</s-text>}
        {state === ORDER_SECTION.itemRejected && lineItemError !== null && (
          <CriticalLine message={lineItemError} />
        )}
      </s-stack>
    </s-section>
  );
}
