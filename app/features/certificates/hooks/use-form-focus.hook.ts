import { useEffect, useRef, type RefObject } from "react";
import type { Draft } from "~/features/certificates/types/certificate-form.types";
import { focusField } from "~/features/certificates/utils/certificate-form-focus.utils";

export function useFocusAfterPick(
  order: Draft["order"],
  changeOrderRef: RefObject<HTMLElement | null>,
) {
  const pending = useRef(false);

  useEffect(() => {
    if (pending.current) {
      pending.current = false;
      changeOrderRef.current?.focus();
    }
  }, [order, changeOrderRef]);

  return () => {
    pending.current = true;
  };
}

export function useInitialFocus(
  editing: boolean,
  selectOrderRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!editing) {
      selectOrderRef.current?.focus();
    }
  }, [editing, selectOrderRef]);
}

// The summary also mounts when errors come back while the merchant types; only a failed Save moves focus.
export function useFocusOncePerFailedSave(failedSaves: number) {
  const focusedSave = useRef(0);

  return (key: string, draft: Draft) => {
    if (focusedSave.current === failedSaves) {
      return;
    }

    focusedSave.current = failedSaves;
    focusField(key, draft);
  };
}
