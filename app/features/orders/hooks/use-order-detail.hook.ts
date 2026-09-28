import { useCallback, useEffect, useRef, useState } from "react";
import type { OrderDetailResponse } from "~/features/orders/types/orders.types";
import {
  isNetworkFailure,
  type JsonResult,
} from "~/shared/utils/json-request.utils";
import type { DetailState } from "~/features/orders/types/order-detail.types";
import {
  fetchOrderDetail,
  loadFailureOf,
} from "~/features/orders/utils/order-requests.utils";

const IDLE: DetailState = { status: "idle" };

function toDetailState(
  response: JsonResult<OrderDetailResponse>,
  numericId: string,
): DetailState {
  if (isNetworkFailure(response)) {
    return { status: "error", openingId: numericId };
  }

  if (!response.ok) {
    return { status: loadFailureOf(response), openingId: numericId };
  }

  return response.detail === null
    ? { status: "missing", openingId: numericId }
    : { status: "ready", openingId: numericId, detail: response.detail };
}

export function useOrderDetail(): {
  state: DetailState;
  open(numericId: string, excludeId: string | null): Promise<DetailState>;
  cancel(): void;
} {
  const [state, setState] = useState<DetailState>(IDLE);
  const requestController = useRef<AbortController | null>(null);

  const open = useCallback(
    async (numericId: string, excludeId: string | null) => {
      requestController.current?.abort();

      const controller = new AbortController();

      requestController.current = controller;
      setState({ status: "loading", openingId: numericId });

      const response = await fetchOrderDetail(
        numericId,
        excludeId,
        controller.signal,
      );

      if (controller.signal.aborted) {
        return IDLE;
      }

      const next = toDetailState(response, numericId);

      requestController.current = null;
      setState(next);

      return next;
    },
    [],
  );

  const cancel = useCallback(() => {
    requestController.current?.abort();
    requestController.current = null;
    setState(IDLE);
  }, []);

  useEffect(
    () => () => {
      requestController.current?.abort();
      requestController.current = null;
    },
    [],
  );

  return { state, open, cancel };
}
