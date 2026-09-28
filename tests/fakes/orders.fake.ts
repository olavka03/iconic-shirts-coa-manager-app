// The dev store's four test orders (spec §12.7 item 10). No customer data at all.

export type FakeProductStatus = "ACTIVE" | "DRAFT" | "ARCHIVED" | "UNLISTED";
export type FakeLineItem = {
  id: string;
  title: string;
  variantTitle: string | null;
  currentQuantity: number;
  isGiftCard: boolean;
  imageUrl: string | null;
  product: {
    id: string;
    title: string;
    status: FakeProductStatus;
    imageUrl: string | null;
  } | null;
};
export type FakeOrder = {
  id: string;
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  displayFulfillmentStatus: string;
  lineItems: FakeLineItem[];
  // Older than the 60 days read_orders can see: absent from search, null by id.
  outsideWindow?: boolean;
};

const imageUrl = (slug: string) =>
  `https://cdn.shopify.com/s/files/1/0000/0001/files/${slug}.jpg`;

const item = (
  suffix: string,
  title: string,
  currentQuantity = 1,
): FakeLineItem => ({
  id: `gid://shopify/LineItem/60001${suffix}`,
  title,
  variantTitle: null,
  currentQuantity,
  isGiftCard: false,
  imageUrl: imageUrl(`li-${suffix}`),
  product: {
    id: `gid://shopify/Product/70001${suffix}`,
    title,
    status: "ACTIVE",
    imageUrl: imageUrl(`p-${suffix}`),
  },
});

export const ORDER_IDS = {
  order141002: "gid://shopify/Order/5000001002",
  order141003: "gid://shopify/Order/5000001003",
  order141004: "gid://shopify/Order/5000001004",
  order141005: "gid://shopify/Order/5000001005",
} as const;

export const LINE_ITEM_IDS = {
  bayern: "gid://shopify/LineItem/60001021",
  dortmund: "gid://shopify/LineItem/60001022",
  arsenal0405: "gid://shopify/LineItem/60001031",
  arsenal0304: "gid://shopify/LineItem/60001032",
  guler: "gid://shopify/LineItem/60001041",
  scholesGiggs: "gid://shopify/LineItem/60001051",
  sneijder: "gid://shopify/LineItem/60001052",
  vanBasten: "gid://shopify/LineItem/60001053",
} as const;

// A fresh copy on every call, newest last; the fake sorts by createdAt.
// The fake shop's prefix is "#", so its names follow Shopify's format; no app code holds it.
export function devStoreOrders(): FakeOrder[] {
  const order = (
    orderNumber: string,
    minute: string,
    lineItems: FakeLineItem[],
  ): FakeOrder => ({
    id: `gid://shopify/Order/500000${orderNumber}`,
    name: `#14${orderNumber}`,
    createdAt: `2026-09-26T10:${minute}:00Z`,
    cancelledAt: null,
    displayFulfillmentStatus: "UNFULFILLED",
    lineItems,
  });

  return [
    order("1002", "02", [
      item(
        "021",
        "Robert Lewandowski Signed Bayern Munich Football Shirt - 2015-16 Home",
      ),
      item(
        "022",
        "Robert Lewandowski Signed Original Borussia Dortmund Football Shirt - 2011-12 Home",
      ),
    ]),
    order("1003", "03", [
      item(
        "031",
        "Dennis Bergkamp Signed Arsenal FC Original 2004–05 Away Shirt",
      ),
      item(
        "032",
        "Dennis Bergkamp Signed Arsenal FC Original 2003–04 Away Shirt",
      ),
    ]),
    order("1004", "04", [
      item(
        "041",
        "Arda Güler Signed Real Madrid 2026/27 Home Football Shirt",
        2,
      ),
    ]),
    order("1005", "05", [
      item(
        "051",
        "Paul Scholes and Ryan Giggs Signed Manchester United 1998-00 Retro Shirt",
      ),
      item("052", "Wesley Sneijder Signed Galatasaray Home Shirt - 2013-2014"),
      item(
        "053",
        "Marco van Basten Signed Netherlands Home Retro Shirt - 1988",
      ),
    ]),
  ];
}

export function giftCardLine(suffix: string): FakeLineItem {
  return {
    id: `gid://shopify/LineItem/69999${suffix}`,
    title: "Gift Card",
    variantTitle: "£50",
    currentQuantity: 1,
    isGiftCard: true,
    imageUrl: null,
    product: null,
  };
}
