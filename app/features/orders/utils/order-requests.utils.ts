import type { OrderDetailResponse } from "~/features/orders/types/orders.types";
import type { ErrorBody } from "~/shared/types/api.types";
import {
  requestJson,
  type JsonResult,
} from "~/shared/utils/json-request.utils";
import type { LoadFailure } from "./picker-view.utils";

export function fetchOrderDetail(
  numericId: string,
  excludeId: string | null,
  signal?: AbortSignal,
): Promise<JsonResult<OrderDetailResponse>> {
  const exclude = excludeId === null ? "" : `&exclude=${excludeId}`;

  return requestJson<OrderDetailResponse>(
    `/api/orders?id=${numericId}${exclude}`,
    { signal },
  );
}

export function loadFailureOf(body: ErrorBody): LoadFailure {
  return body.formError === "orders_access" ? "no_access" : "error";
}
