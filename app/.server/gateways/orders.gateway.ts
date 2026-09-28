import {
  adminGraphql,
  type AdminClient,
  type AdminGraphqlOptions,
} from "./admin-graphql.gateway";
import type { ProductStatus } from "~/shared/types/api.types";

export type OrderNode = {
  id: string;
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  displayFulfillmentStatus: string;
  currentSubtotalLineItemsQuantity: number;
  lineItems: { title: string; currentQuantity: number; isGiftCard: boolean }[];
};
export type OrderLineItemNode = {
  id: string;
  title: string;
  variantTitle: string | null;
  currentQuantity: number;
  imageUrl: string | null;
  product: {
    id: string;
    title: string;
    status: ProductStatus;
    imageUrl: string | null;
  } | null;
};
export type OrderWithItems = {
  id: string;
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  displayFulfillmentStatus: string;
  lineItems: OrderLineItemNode[];
};

const ORDER_PICKER = `#graphql
  query CoaOrderPicker($first: Int!, $query: String) {
    orders(first: $first, sortKey: CREATED_AT, reverse: true, query: $query) {
      nodes {
        id
        name
        createdAt
        cancelledAt
        displayFulfillmentStatus
        currentSubtotalLineItemsQuantity
        lineItems(first: 5) {
          nodes {
            title
            currentQuantity
            isGiftCard
          }
        }
      }
      pageInfo {
        hasNextPage
      }
    }
  }
` as const;

const ORDER_LINE_ITEMS = `#graphql
  query CoaOrderLineItems($id: ID!, $after: String) {
    order(id: $id) {
      id
      name
      createdAt
      cancelledAt
      displayFulfillmentStatus
      lineItems(first: 50, after: $after) {
        nodes {
          id
          title
          variantTitle
          currentQuantity
          isGiftCard
          image {
            url(transform: { maxWidth: 160, maxHeight: 160 })
          }
          product {
            id
            title
            status
            featuredMedia {
              preview {
                image {
                  url(transform: { maxWidth: 160, maxHeight: 160 })
                }
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
` as const;

const PICKER_SIZE = 10;
// 5 pages of 50: far more line items than a real order has, and a bound on the calls.
const MAX_LINE_ITEM_PAGES = 5;

export async function listOrders(
  admin: AdminClient,
  search: { query: string | null },
  options?: AdminGraphqlOptions,
): Promise<{ orders: OrderNode[]; hasNextPage: boolean }> {
  const data = await adminGraphql(
    admin,
    ORDER_PICKER,
    { first: PICKER_SIZE, query: search.query },
    options,
  );

  return {
    orders: data.orders.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      createdAt: node.createdAt,
      cancelledAt: node.cancelledAt ?? null,
      displayFulfillmentStatus: node.displayFulfillmentStatus,
      currentSubtotalLineItemsQuantity: node.currentSubtotalLineItemsQuantity,
      lineItems: node.lineItems.nodes.map((item) => ({
        title: item.title,
        currentQuantity: item.currentQuantity,
        isGiftCard: item.isGiftCard,
      })),
    })),
    hasNextPage: data.orders.pageInfo.hasNextPage,
  };
}

type LineItemPage = {
  order: Omit<OrderWithItems, "lineItems">;
  items: OrderLineItemNode[];
  next: string | null;
};

async function lineItemPage(
  admin: AdminClient,
  orderId: string,
  after: string | null,
  options?: AdminGraphqlOptions,
): Promise<LineItemPage | null> {
  const data = await adminGraphql(
    admin,
    ORDER_LINE_ITEMS,
    { id: orderId, after },
    options,
  );
  const order = data.order;

  // Unknown ids and orders older than the 60-day read_orders window.
  if (!order) {
    return null;
  }

  const { hasNextPage, endCursor } = order.lineItems.pageInfo;

  return {
    order: {
      id: order.id,
      name: order.name,
      createdAt: order.createdAt,
      cancelledAt: order.cancelledAt ?? null,
      displayFulfillmentStatus: order.displayFulfillmentStatus,
    },
    items: order.lineItems.nodes
      .filter((item) => !item.isGiftCard)
      .map((item) => ({
        id: item.id,
        title: item.title,
        variantTitle: item.variantTitle ?? null,
        currentQuantity: item.currentQuantity,
        imageUrl: item.image?.url ?? null,
        product: item.product
          ? {
              id: item.product.id,
              title: item.product.title,
              status: item.product.status,
              imageUrl: item.product.featuredMedia?.preview?.image?.url ?? null,
            }
          : null,
      })),
    next: hasNextPage ? (endCursor ?? null) : null,
  };
}

export async function getOrderLineItems(
  admin: AdminClient,
  orderId: string,
  options?: AdminGraphqlOptions,
): Promise<OrderWithItems | null> {
  const firstPage = await lineItemPage(admin, orderId, null, options);

  if (!firstPage) {
    return null;
  }

  const items = [...firstPage.items];
  let cursor = firstPage.next;

  for (let page = 1; page < MAX_LINE_ITEM_PAGES && cursor; page++) {
    const nextPage = await lineItemPage(admin, orderId, cursor, options);

    if (!nextPage) {
      return null;
    }

    items.push(...nextPage.items);
    cursor = nextPage.next;
  }

  return { ...firstPage.order, lineItems: items };
}
