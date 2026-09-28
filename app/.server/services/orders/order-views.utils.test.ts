import { describe, expect, it } from "vitest";
import type {
  OrderLineItemNode,
  OrderWithItems,
} from "~/.server/gateways/orders.gateway";
import {
  FULFILLMENT,
  fulfillmentBadge,
  itemSummaryOf,
  toOrderCard,
  toOrderRow,
} from "./order-views.utils";

const CDN = "https://cdn.shopify.com/s/files/1/0000/0001/files";
const ORDER_ID = "gid://shopify/Order/5000001004";
const GULER_ID = "gid://shopify/LineItem/60001041";
const GULER_TITLE = "Arda Güler Signed Real Madrid 2026/27 Home Football Shirt";

function lineItem(
  overrides: Partial<OrderLineItemNode> = {},
): OrderLineItemNode {
  return {
    id: GULER_ID,
    title: GULER_TITLE,
    variantTitle: "Unframed",
    currentQuantity: 2,
    imageUrl: `${CDN}/li-041.jpg`,
    product: {
      id: "gid://shopify/Product/70001041",
      title: GULER_TITLE,
      status: "ACTIVE",
      imageUrl: `${CDN}/p-041.jpg`,
    },
    ...overrides,
  };
}

function order(lineItems: OrderLineItemNode[]): OrderWithItems {
  return {
    id: ORDER_ID,
    name: "#141004",
    createdAt: "2026-09-26T10:04:00Z",
    cancelledAt: null,
    displayFulfillmentStatus: "PARTIALLY_FULFILLED",
    lineItems,
  };
}

describe("fulfillment badges (spec §6.4.9)", () => {
  it.each([
    ["UNFULFILLED", "Unfulfilled", "caution"],
    ["PARTIALLY_FULFILLED", "Partially fulfilled", "warning"],
    ["FULFILLED", "Fulfilled", "auto"],
    ["IN_PROGRESS", "In progress", "caution"],
    ["OPEN", "Open", "caution"],
    ["PENDING_FULFILLMENT", "Pending fulfillment", "caution"],
    ["ON_HOLD", "On hold", "warning"],
    ["SCHEDULED", "Scheduled", "info"],
    ["REQUEST_DECLINED", "Request declined", "critical"],
    ["RESTOCKED", "Restocked", "auto"],
  ])("shows %s as %s with tone %s", (status, label, tone) => {
    expect(fulfillmentBadge(status)).toEqual({ label, tone });
  });

  it("maps exactly the ten statuses of the API version", () => {
    expect(Object.keys(FULFILLMENT)).toHaveLength(10);
  });

  it("shows a status it doesn't know in sentence case with tone auto", () => {
    expect(fulfillmentBadge("FULFILLMENT_NOT_REQUIRED")).toEqual({
      label: "Fulfillment not required",
      tone: "auto",
    });
    expect(fulfillmentBadge("constructor")).toEqual({
      label: "Constructor",
      tone: "auto",
    });
  });
});

describe("order rows", () => {
  it("summarises the first three live items, without removed lines and gift cards", () => {
    expect(
      itemSummaryOf([
        { title: "Refunded Shirt", currentQuantity: 0 },
        { title: "Gift Card", currentQuantity: 1, isGiftCard: true },
        { title: "Shirt A", currentQuantity: 1 },
        { title: "Shirt B", currentQuantity: 2 },
        { title: "Shirt C", currentQuantity: 1, isGiftCard: false },
        { title: "Shirt D", currentQuantity: 1 },
      ]),
    ).toBe("Shirt A, Shirt B, Shirt C");
  });

  it("formats an order row in the shop's time zone", () => {
    expect(
      toOrderRow(
        {
          id: ORDER_ID,
          name: "#141004",
          createdAt: "2026-09-26T10:04:00Z",
          cancelledAt: "2026-09-26T12:00:00Z",
          displayFulfillmentStatus: "UNFULFILLED",
        },
        {
          itemCount: 2,
          itemSummary: GULER_TITLE,
          certificateCount: 1,
          timeZone: "Europe/London",
        },
      ),
    ).toEqual({
      id: ORDER_ID,
      numericId: "5000001004",
      name: "#141004",
      createdLabel: "26 Sep 2026 at 11:04",
      fulfillment: { label: "Unfulfilled", tone: "caution" },
      cancelled: true,
      itemCount: 2,
      itemSummary: GULER_TITLE,
      certificateCount: 1,
    });
  });
});

describe("toOrderCard", () => {
  const removed = lineItem({
    id: "gid://shopify/LineItem/60001042",
    currentQuantity: 0,
  });

  it("describes the linked item and counts the selectable items", () => {
    expect(
      toOrderCard(
        order([lineItem({ imageUrl: null }), removed]),
        GULER_ID,
        "Europe/London",
      ),
    ).toEqual({
      createdLabel: "26 Sep 2026 at 11:04",
      fulfillment: { label: "Partially fulfilled", tone: "warning" },
      cancelled: false,
      selectableItems: 1,
      lineItem: {
        variantTitle: "Unframed",
        quantity: 2,
        imageUrl: `${CDN}/p-041.jpg`,
      },
    });
  });

  it("has no line item when the item is gone or its quantity is 0", () => {
    expect(
      toOrderCard(order([removed]), removed.id, "Europe/London").lineItem,
    ).toBeNull();
    expect(
      toOrderCard(
        order([lineItem()]),
        "gid://shopify/LineItem/1",
        "Europe/London",
      ).lineItem,
    ).toBeNull();
  });
});
