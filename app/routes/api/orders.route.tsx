import {
  isAdminApiError,
  type AdminContext,
} from "~/.server/gateways/admin-graphql.gateway";
import type {
  OrderDetailResponse,
  OrdersListResponse,
} from "~/features/orders/types/orders.types";
import { log } from "~/.server/logging/logger.service";
import {
  invalid,
  jsonResponse,
  parseIdParam,
  withJsonErrors,
} from "~/.server/services/shared/json-response.utils";
import {
  getPickerOrder,
  listPickerOrders,
} from "~/.server/services/orders/orders.service";
import {
  REQUEST_BUDGET_MS,
  rethrowAuth,
} from "~/.server/services/shared/admin-read.utils";
import { adminContextOf } from "~/.server/shopify/admin-context.service";
import type { Route } from "./+types/orders.route";

type OrdersRequest =
  | { kind: "list"; query: string }
  | { kind: "detail"; orderId: string; excludeId: string | undefined };

const ORDER_ID = /^\d{1,20}$/;

function parseOrdersRequest(search: URLSearchParams): OrdersRequest | null {
  const query = search.get("q");
  const id = search.get("id");
  const exclude = search.get("exclude");
  const excludeId = parseIdParam(exclude);

  if (exclude !== null && excludeId === null) {
    return null;
  }

  if (id === null) {
    return { kind: "list", query: query ?? "" };
  }

  if (query !== null || !ORDER_ID.test(id)) {
    return null;
  }

  return {
    kind: "detail",
    orderId: `gid://shopify/Order/${id}`,
    excludeId: excludeId ?? undefined,
  };
}

async function readOrders(
  shopContext: AdminContext,
  ordersRequest: OrdersRequest,
): Promise<OrdersListResponse | OrderDetailResponse> {
  const signal = AbortSignal.timeout(REQUEST_BUDGET_MS);

  if (ordersRequest.kind === "list") {
    return {
      ok: true,
      ...(await listPickerOrders(shopContext, ordersRequest.query, { signal })),
    };
  }

  return {
    ok: true,
    detail: await getPickerOrder(
      shopContext,
      ordersRequest.orderId,
      ordersRequest.excludeId,
      { signal },
    ),
  };
}

export const loader = ({ request }: Route.LoaderArgs) =>
  withJsonErrors("api.orders.failed", async () => {
    const shopContext = await adminContextOf(request);
    const ordersRequest = parseOrdersRequest(new URL(request.url).searchParams);

    if (ordersRequest === null) {
      return invalid();
    }

    try {
      return jsonResponse(await readOrders(shopContext, ordersRequest));
    } catch (error) {
      rethrowAuth(error);

      // Missing access is a stable store state, not a failed request, so there is nothing to retry.
      if (isAdminApiError(error) && error.kind === "access_denied") {
        log.error("orders.access_denied", {
          shop: shopContext.shop,
          reason: error.reason ?? "scope",
          message: error.message,
        });

        return jsonResponse({
          ok: false,
          formError: "orders_access",
        } satisfies OrdersListResponse);
      }

      throw error;
    }
  });
