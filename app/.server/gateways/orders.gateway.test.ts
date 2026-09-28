import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFakeAdmin,
  type FakeAdmin,
} from "../../../tests/fakes/admin-api.fake";
import {
  devStoreOrders,
  giftCardLine,
  LINE_ITEM_IDS,
  ORDER_IDS,
  type FakeLineItem,
  type FakeOrder,
} from "../../../tests/fakes/orders.fake";
import { setSleepForTests } from "./admin-graphql.gateway";
import { getOrderLineItems, listOrders } from "./orders.gateway";

let fake: FakeAdmin;

beforeEach(() => {
  fake = createFakeAdmin();
  setSleepForTests(async () => {});
});

afterEach(() => setSleepForTests(null));

function manyItems(count: number): FakeLineItem[] {
  return Array.from({ length: count }, (_unusedValue, index) => ({
    id: `gid://shopify/LineItem/7${String(index).padStart(4, "0")}`,
    title: `Signed Shirt ${index}`,
    variantTitle: null,
    currentQuantity: 1,
    isGiftCard: false,
    imageUrl: null,
    product: null,
  }));
}

function bigOrder(count: number): FakeOrder {
  return {
    id: "gid://shopify/Order/5000009999",
    name: "#149999",
    createdAt: "2026-09-25T09:00:00Z",
    cancelledAt: null,
    displayFulfillmentStatus: "FULFILLED",
    lineItems: manyItems(count),
  };
}

describe("listOrders", () => {
  it("lists the newest orders first with the first ten requested", async () => {
    const { orders, hasNextPage } = await listOrders(fake.client, {
      query: null,
    });

    expect(orders.map((order) => order.name)).toEqual([
      "#141005",
      "#141004",
      "#141003",
      "#141002",
    ]);
    expect(hasNextPage).toBe(false);
    expect(fake.callsTo("CoaOrderPicker")[0].variables).toEqual({
      first: 10,
      query: null,
    });
  });

  it("maps a row's summary fields and its first line items", async () => {
    const { orders } = await listOrders(fake.client, { query: null });

    expect(orders[1]).toEqual({
      id: ORDER_IDS.order141004,
      name: "#141004",
      createdAt: "2026-09-26T10:04:00Z",
      cancelledAt: null,
      displayFulfillmentStatus: "UNFULFILLED",
      currentSubtotalLineItemsQuantity: 2,
      lineItems: [
        {
          title: "Arda Güler Signed Real Madrid 2026/27 Home Football Shirt",
          currentQuantity: 2,
          isGiftCard: false,
        },
      ],
    });
  });

  it("passes the search query through", async () => {
    const { orders } = await listOrders(fake.client, {
      query: "name:141002 OR name:#141002",
    });

    expect(orders.map((order) => order.name)).toEqual(["#141002"]);
    expect(fake.callsTo("CoaOrderPicker")[0].variables.query).toBe(
      "name:141002 OR name:#141002",
    );
  });

  it("reports more results beyond the first ten", async () => {
    const orders = Array.from({ length: 12 }, (_unusedValue, index) => ({
      ...devStoreOrders()[0],
      id: `gid://shopify/Order/60000${index}`,
      name: `#15${String(index).padStart(4, "0")}`,
      createdAt: `2026-09-2${index % 10}T08:00:00Z`,
    }));

    fake = createFakeAdmin({ orders });

    const result = await listOrders(fake.client, { query: null });

    expect(result.orders).toHaveLength(10);
    expect(result.hasNextPage).toBe(true);
  });
});

describe("getOrderLineItems", () => {
  it("returns an order's line items with their products", async () => {
    const order = await getOrderLineItems(fake.client, ORDER_IDS.order141002);

    expect(order).toMatchObject({
      id: ORDER_IDS.order141002,
      name: "#141002",
      createdAt: "2026-09-26T10:02:00Z",
      cancelledAt: null,
      displayFulfillmentStatus: "UNFULFILLED",
    });
    expect(order?.lineItems[0]).toEqual({
      id: LINE_ITEM_IDS.bayern,
      title:
        "Robert Lewandowski Signed Bayern Munich Football Shirt - 2015-16 Home",
      variantTitle: null,
      currentQuantity: 1,
      imageUrl: "https://cdn.shopify.com/s/files/1/0000/0001/files/li-021.jpg",
      product: {
        id: "gid://shopify/Product/70001021",
        title:
          "Robert Lewandowski Signed Bayern Munich Football Shirt - 2015-16 Home",
        status: "ACTIVE",
        imageUrl: "https://cdn.shopify.com/s/files/1/0000/0001/files/p-021.jpg",
      },
    });
  });

  it("reads every page of 50", async () => {
    fake = createFakeAdmin({ orders: [bigOrder(120)] });

    const order = await getOrderLineItems(
      fake.client,
      "gid://shopify/Order/5000009999",
    );
    const calls = fake.callsTo("CoaOrderLineItems");

    expect(order?.lineItems).toHaveLength(120);
    expect(calls.map((call) => call.variables.after)).toEqual([
      null,
      "50",
      "100",
    ]);
  });

  it("stops after five pages", async () => {
    fake = createFakeAdmin({ orders: [bigOrder(300)] });

    const order = await getOrderLineItems(
      fake.client,
      "gid://shopify/Order/5000009999",
    );

    expect(order?.lineItems).toHaveLength(250);
    expect(fake.callsTo("CoaOrderLineItems")).toHaveLength(5);
  });

  it("drops gift cards", async () => {
    fake.orders[0].lineItems.push(giftCardLine("1"));

    const order = await getOrderLineItems(fake.client, ORDER_IDS.order141002);

    expect(order?.lineItems.map((lineItem) => lineItem.id)).toEqual([
      LINE_ITEM_IDS.bayern,
      LINE_ITEM_IDS.dortmund,
    ]);
  });

  it("returns null for an order outside the 60-day window", async () => {
    fake.orders[0].outsideWindow = true;

    expect(
      await getOrderLineItems(fake.client, ORDER_IDS.order141002),
    ).toBeNull();
  });

  it("returns null for an unknown order", async () => {
    expect(
      await getOrderLineItems(fake.client, "gid://shopify/Order/1"),
    ).toBeNull();
  });

  it("returns null when the order disappears between pages", async () => {
    fake = createFakeAdmin({ orders: [bigOrder(60)] });

    const inner = fake.client.graphql;

    fake.client.graphql = (async (query: string, options?: unknown) => {
      if (fake.callsTo("CoaOrderLineItems").length === 1) {
        fake.orders[0].outsideWindow = true;
      }

      return inner(query as never, options as never);
    }) as typeof inner;

    expect(
      await getOrderLineItems(fake.client, "gid://shopify/Order/5000009999"),
    ).toBeNull();
  });

  it("returns a null product for a deleted product or a custom item", async () => {
    fake.removeProduct("gid://shopify/Product/70001021");

    const order = await getOrderLineItems(fake.client, ORDER_IDS.order141002);

    expect(order?.lineItems[0].product).toBeNull();
    expect(order?.lineItems[1].product).not.toBeNull();
  });
});
