import { useImperativeHandle, useReducer, useRef, type Ref } from "react";
import { useLiveAnnouncement } from "~/features/orders/hooks/use-live-announcement.hook";
import { useOrderDetail } from "~/features/orders/hooks/use-order-detail.hook";
import { useOrderSearch } from "~/features/orders/hooks/use-order-search.hook";
import { usePickerFocus } from "~/features/orders/hooks/use-picker-focus.hook";
import {
  ORDERS_STEP,
  pickerStepReducer,
} from "~/features/orders/reducers/picker-step.reducer";
import type {
  OrderPick,
  PickerOpen,
} from "~/features/orders/types/order-picker.types";
import {
  autoPick,
  itemsHeaderOf,
  liveMessage,
  type PickerOrder,
} from "~/features/orders/utils/order-picker.utils";
import { useDomEvent } from "~/shared/hooks/use-dom-event.hook";
import type {
  OrderItemRow,
  OrderRow,
} from "~/features/orders/types/orders.types";
import type { CertificateReference } from "~/shared/types/api.types";
import { PoliteAnnouncement } from "~/shared/components/polite-announcement.component";
import {
  ItemsBody,
  ItemsHeader,
  OrdersStep,
} from "./order-picker-steps.component";

export type OrderPickerHandle = { prepare(open: PickerOpen): void };

export type OrderPickerProps = {
  ref?: Ref<OrderPickerHandle>;
  excludeId: string | null;
  currentOrderId: string | null;
  prefetch: boolean;
  onPick(pick: OrderPick): void;
  onNavigate(href: string): void;
};

export function OrderPicker({
  ref,
  excludeId,
  currentOrderId,
  prefetch,
  onPick,
  onNavigate,
}: OrderPickerProps) {
  const search = useOrderSearch({ prefetch });
  const orderDetail = useOrderDetail();
  const [{ step, target }, dispatchStep] = useReducer(
    pickerStepReducer,
    ORDERS_STEP,
  );
  const modalRef = useRef<HTMLElementTagNameMap["s-modal"]>(null);
  const searchRef = useRef<HTMLElementTagNameMap["s-search-field"]>(null);
  const backRef = useRef<HTMLElementTagNameMap["s-button"]>(null);
  const detailState = orderDetail.state;
  const status = detailState.status;
  const detail = detailState.status === "ready" ? detailState.detail : null;
  const header = itemsHeaderOf(detail, target);

  usePickerFocus({ modalRef, searchRef, backRef, step, status });

  const hide = () => modalRef.current?.hideOverlay();

  const loadItems = (picked: PickerOrder) => {
    dispatchStep({ type: "loadItems", order: picked });
    void orderDetail.open(picked.numericId, excludeId);
  };

  const openOrder = async (row: OrderRow) => {
    dispatchStep({ type: "openRow", row });

    const result = await orderDetail.open(row.numericId, excludeId);

    // Superseded, cancelled or failed: step 1 stays, with its banner on failure.
    if (result.status === "idle" || result.status === "error") {
      return;
    }

    const pick = result.status === "ready" ? autoPick(result.detail) : null;

    if (pick !== null) {
      onPick(pick);
      hide();

      return;
    }

    dispatchStep({ type: "showItems" });
  };

  const pickItem = (item: OrderItemRow) => {
    if (detailState.status === "ready" && !item.includesThis) {
      onPick({
        order: detailState.detail.order,
        item,
        detail: detailState.detail,
      });
    }

    hide();
  };

  const openCertificate = (certificate: CertificateReference) => {
    hide();
    onNavigate(`/app/certificates/${certificate.id}`);
  };

  const backToOrders = () => {
    orderDetail.cancel();
    dispatchStep({ type: "backToOrders" });
    search.ensureRecent();
  };

  const changeQuery = (nextQuery: string) => {
    if (status === "error") {
      orderDetail.cancel();
    }

    search.setQuery(nextQuery);
  };

  const retryOpen = () => {
    if (target?.row) {
      void openOrder(target.row);
    } else if (target !== null) {
      loadItems(target.order);
    }
  };

  useImperativeHandle(ref, () => ({
    prepare(open: PickerOpen) {
      orderDetail.cancel();

      // "Change" (item): step 2 of the saved order, never auto-skipped.
      if (open.step === "items") {
        loadItems(open.order);

        return;
      }

      dispatchStep({ type: "backToOrders" });
      search.setQuery(open.query ?? "");

      if (open.query) {
        search.submit();
      }

      search.ensureRecent();
      search.refreshRecent();
    },
  }));

  useDomEvent(modalRef, "afterhide", () => {
    orderDetail.cancel();
    dispatchStep({ type: "backToOrders" });
  });

  useDomEvent(searchRef, "keydown", (event) => {
    if (
      !(event instanceof KeyboardEvent) ||
      event.key !== "Enter" ||
      event.isComposing
    ) {
      return;
    }

    if (search.view.exactMatch !== null) {
      void openOrder(search.view.exactMatch);
    } else {
      search.submit();
    }
  });

  const openingRow = status === "loading" ? (target?.row ?? null) : null;
  const announcement = useLiveAnnouncement(
    liveMessage(step, detailState, openingRow, search.view),
  );

  return (
    <s-modal
      ref={modalRef}
      id="order-picker"
      heading={step === "orders" ? "Select order" : "Select item"}
      padding="none"
    >
      {step === "orders" ? (
        <OrdersStep
          view={search.view}
          query={search.query}
          searchRef={searchRef}
          openingId={
            detailState.status === "loading" ? detailState.openingId : null
          }
          openFailed={status === "error"}
          currentOrderId={currentOrderId}
          onQuery={changeQuery}
          onRetryOrders={search.retry}
          onRetryOpen={retryOpen}
          onOpen={(row) => void openOrder(row)}
        />
      ) : (
        <>
          {header !== null && (
            <ItemsHeader
              header={header}
              legacy={detail?.legacyCertificates ?? []}
              onCertificate={openCertificate}
            />
          )}
          <ItemsBody
            state={detailState}
            onSelect={pickItem}
            onCertificate={openCertificate}
            onRetry={retryOpen}
          />
          <s-button
            ref={backRef}
            slot="secondary-actions"
            onClick={backToOrders}
          >
            Back to orders
          </s-button>
        </>
      )}
      <s-button
        slot="secondary-actions"
        commandFor="order-picker"
        command="--hide"
      >
        Cancel
      </s-button>
      <PoliteAnnouncement message={announcement} />
    </s-modal>
  );
}
