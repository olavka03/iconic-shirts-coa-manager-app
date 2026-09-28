import type { RefObject } from "react";
import type { DetailState } from "~/features/orders/types/order-detail.types";
import type { ItemsHeaderData } from "~/features/orders/utils/order-picker.utils";
import type { PickerView } from "~/features/orders/utils/picker-view.utils";
import type {
  OrderItemRow,
  OrderRow,
} from "~/features/orders/types/orders.types";
import type { CertificateReference } from "~/shared/types/api.types";
import { CertificateLinks, ItemRow } from "./item-row.component";
import {
  AccessBanner,
  CenteredSpinner,
  FailureBanner,
} from "./order-picker-banners.component";
import { OrderListRow } from "./order-list-row.component";

function EmptyResult({ view }: { view: PickerView }) {
  return (
    <s-box padding="large">
      <s-stack gap="small-200" alignItems="center">
        <s-icon type={view.kind === "no_orders" ? "order" : "search"} />
        <s-text type="strong">{view.header}</s-text>
        <s-paragraph color="subdued">{view.emptyText}</s-paragraph>
      </s-stack>
    </s-box>
  );
}

function ListHeader({ view }: { view: PickerView }) {
  return (
    <s-box paddingInline="base" paddingBlock="small-200">
      <s-stack direction="inline" gap="small-200" alignItems="center">
        <s-text color="subdued">{view.header}</s-text>
        {view.kind === "searching" && (
          <s-spinner size="base" accessibilityLabel="Searching orders" />
        )}
      </s-stack>
    </s-box>
  );
}

function OrdersStatus({
  view,
  onRetry,
}: {
  view: PickerView;
  onRetry(): void;
}) {
  switch (view.kind) {
    case "loading":
      return <CenteredSpinner label="Loading orders" />;
    case "error":
      return (
        <FailureBanner heading="Orders couldn't be loaded" onRetry={onRetry} />
      );
    case "no_access":
      return <AccessBanner />;
    case "no_results":
    case "no_orders":
      return <EmptyResult view={view} />;
    default:
      return <ListHeader view={view} />;
  }
}

type OrdersStepProps = {
  view: PickerView;
  query: string;
  searchRef: RefObject<HTMLElementTagNameMap["s-search-field"] | null>;
  openingId: string | null;
  openFailed: boolean;
  currentOrderId: string | null;
  onQuery(query: string): void;
  onRetryOrders(): void;
  onRetryOpen(): void;
  onOpen(row: OrderRow): void;
};

export function OrdersStep({
  view,
  query,
  searchRef,
  openingId,
  openFailed,
  currentOrderId,
  onQuery,
  onRetryOrders,
  onRetryOpen,
  onOpen,
}: OrdersStepProps) {
  return (
    <>
      <s-box padding="base">
        <s-search-field
          ref={searchRef}
          label="Search orders"
          labelAccessibilityVisibility="exclusive"
          placeholder="Search by order number"
          autocomplete="off"
          value={query}
          onInput={(event) => onQuery(event.currentTarget.value)}
        />
      </s-box>
      <s-divider />
      {openFailed && (
        <FailureBanner
          heading="Orders couldn't be loaded"
          onRetry={onRetryOpen}
        />
      )}
      <OrdersStatus view={view} onRetry={onRetryOrders} />
      {view.rows.map((row) => (
        <OrderListRow
          key={row.id}
          row={row}
          opening={openingId === row.numericId}
          selected={row.id === currentOrderId}
          onOpen={onOpen}
        />
      ))}
      {view.hint !== null && (
        <s-box paddingInline="base" paddingBlock="small">
          <s-text color="subdued">{view.hint}</s-text>
        </s-box>
      )}
    </>
  );
}

export function ItemsHeader({
  header,
  legacy,
  onCertificate,
}: {
  header: ItemsHeaderData;
  legacy: CertificateReference[];
  onCertificate(certificate: CertificateReference): void;
}) {
  return (
    <s-box padding="base">
      <s-stack gap="small-200">
        <s-stack direction="inline" gap="small-200" alignItems="center">
          <s-text type="strong">{header.name}</s-text>
          {header.cancelled && <s-badge>Canceled</s-badge>}
          {header.fulfillment !== null && (
            <s-badge tone={header.fulfillment.tone}>
              {header.fulfillment.label}
            </s-badge>
          )}
        </s-stack>
        {header.createdLabel !== null && (
          <s-text color="subdued">{header.createdLabel}</s-text>
        )}
        {legacy.length > 0 && (
          <s-banner tone="warning">
            This order has certificates that aren&apos;t linked to an item:{" "}
            <CertificateLinks certificates={legacy} onOpen={onCertificate} />.
            Check them before you create another one.
          </s-banner>
        )}
      </s-stack>
    </s-box>
  );
}

export function ItemsBody({
  state,
  onSelect,
  onCertificate,
  onRetry,
}: {
  state: DetailState;
  onSelect(row: OrderItemRow): void;
  onCertificate(certificate: CertificateReference): void;
  onRetry(): void;
}) {
  switch (state.status) {
    case "ready":
      return state.detail.lineItems.map((row) => (
        <ItemRow
          key={row.id}
          row={row}
          onSelect={onSelect}
          onCertificate={onCertificate}
        />
      ));
    case "missing":
      return (
        <s-box padding="base">
          <s-banner tone="info" heading="This order can't be selected">
            Orders placed more than 60 days ago, or deleted orders, can&apos;t
            be selected.
          </s-banner>
        </s-box>
      );
    case "error":
      return (
        <FailureBanner
          heading="This order couldn't be loaded"
          onRetry={onRetry}
        />
      );
    case "no_access":
      return <AccessBanner />;
    default:
      return <CenteredSpinner label="Loading items" />;
  }
}
