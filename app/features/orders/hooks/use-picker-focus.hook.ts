import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { DetailState } from "~/features/orders/types/order-detail.types";
import type { PickerStep } from "~/features/orders/types/order-picker.types";
import { SETTLED } from "~/features/orders/utils/order-picker.utils";
import { useDomEvent } from "~/shared/hooks/use-dom-event.hook";

type PickerFocusOptions = {
  modalRef: RefObject<HTMLElementTagNameMap["s-modal"] | null>;
  searchRef: RefObject<HTMLElementTagNameMap["s-search-field"] | null>;
  backRef: RefObject<HTMLElementTagNameMap["s-button"] | null>;
  step: PickerStep;
  status: DetailState["status"];
};

export function usePickerFocus({
  modalRef,
  searchRef,
  backRef,
  step,
  status,
}: PickerFocusOptions): void {
  const shown = useRef(false);

  const focusItems = useCallback(() => {
    const first = modalRef.current?.querySelector<HTMLElement>("s-clickable");

    (first ?? backRef.current)?.focus();
  }, [modalRef, backRef]);

  useDomEvent(modalRef, "aftershow", () => {
    shown.current = true;

    if (step === "orders") {
      searchRef.current?.focus();
    } else if (SETTLED.has(status)) {
      focusItems();
    }
  });

  useDomEvent(modalRef, "afterhide", () => {
    shown.current = false;
  });

  useEffect(() => {
    if (shown.current && step === "orders") {
      searchRef.current?.focus();
    }
  }, [step, searchRef]);

  useEffect(() => {
    if (shown.current && step === "items" && SETTLED.has(status)) {
      focusItems();
    }
  }, [step, status, focusItems]);
}
