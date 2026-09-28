import { useButtonRef } from "~/features/orders/hooks/use-button-ref.hook";
import type { OrderSectionProps } from "~/features/orders/types/order-section.types";
import {
  ORDER_SECTION,
  orderSectionState,
} from "~/features/orders/utils/order-section-state.utils";
import { orderToken } from "~/features/orders/utils/orders.utils";
import { CriticalLine } from "./critical-line.component";
import { LinkedOrder } from "./order-card.component";

type EmptyOrderProps = Pick<
  OrderSectionProps,
  "orderError" | "onOpenPicker" | "selectOrderRef"
>;

function EmptyOrder({
  orderError,
  onOpenPicker,
  selectOrderRef,
}: EmptyOrderProps) {
  const selectButtonRef = useButtonRef(selectOrderRef);

  return (
    <s-section heading="Order">
      <s-stack gap="base">
        <s-paragraph color="subdued">
          Select the order and the item this certificate is for. The item name,
          signer, and code are filled in from the order.
        </s-paragraph>
        <s-stack direction="inline">
          <s-button
            id="select-order"
            ref={selectButtonRef}
            variant="primary"
            icon="order"
            commandFor="order-picker"
            command="--show"
            onClick={() => onOpenPicker({ step: "orders" })}
          >
            Select order
          </s-button>
        </s-stack>
        {orderError !== null && <CriticalLine message={orderError} />}
      </s-stack>
    </s-section>
  );
}

type UnlinkedOrderProps = { orderName: string | null } & Pick<
  OrderSectionProps,
  "onOpenPicker" | "selectOrderRef"
>;

function UnlinkedOrder({
  orderName,
  onOpenPicker,
  selectOrderRef,
}: UnlinkedOrderProps) {
  const linkButtonRef = useButtonRef(selectOrderRef);

  return (
    <s-section heading="Order">
      <s-grid gridTemplateColumns="1fr auto" gap="small" alignItems="center">
        <s-stack gap="small-300">
          {orderName !== null && <s-text type="strong">{orderName}</s-text>}
          <s-text color="subdued">Not linked to an order in Shopify</s-text>
        </s-stack>
        <s-button
          id="select-order"
          ref={linkButtonRef}
          variant="tertiary"
          icon="link"
          commandFor="order-picker"
          command="--show"
          onClick={() =>
            onOpenPicker({
              step: "orders",
              query: orderToken(orderName) ?? undefined,
            })
          }
        >
          Link order
        </s-button>
      </s-grid>
    </s-section>
  );
}

export function OrderSection(props: OrderSectionProps) {
  const state = orderSectionState(props);

  if (state === ORDER_SECTION.empty || state === ORDER_SECTION.emptyWithError) {
    return (
      <EmptyOrder
        orderError={props.orderError}
        onOpenPicker={props.onOpenPicker}
        selectOrderRef={props.selectOrderRef}
      />
    );
  }

  if (
    state === ORDER_SECTION.legacyNamed ||
    state === ORDER_SECTION.legacyUnnamed ||
    props.order === null
  ) {
    return (
      <UnlinkedOrder
        orderName={props.order?.name ?? null}
        onOpenPicker={props.onOpenPicker}
        selectOrderRef={props.selectOrderRef}
      />
    );
  }

  return (
    <LinkedOrder
      order={props.order}
      state={state}
      orderCard={props.orderCard}
      lineItem={props.lineItem}
      productImageUrl={props.productImageUrl}
      lineItemError={props.lineItemError}
      filledLine={props.filledLine}
      onOpenPicker={props.onOpenPicker}
      changeOrderRef={props.changeOrderRef}
    />
  );
}
