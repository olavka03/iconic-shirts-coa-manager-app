import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminApiError } from "~/.server/gateways/admin-graphql.gateway";
import { setLogSink, type LogLine } from "~/.server/logging/logger.service";
import { certificatesForOrder } from "~/.server/repositories/order-links.repository";
import {
  createFakeAdmin,
  type FakeAdmin,
  type FakeShop,
} from "../../../../tests/fakes/admin-api.fake";
import {
  giftCardLine,
  LINE_ITEM_IDS,
  ORDER_IDS,
  type FakeOrder,
} from "../../../../tests/fakes/orders.fake";
import {
  createCertificateRow,
  linkedWrite,
  OTHER_SHOP,
  SHOP,
} from "../../../../tests/helpers/certificate-row.factory";
import { dropCodeDictionary } from "~/.server/services/codes/codes.service";
import {
  getOrderCard,
  getPickerOrder,
  listPickerOrders,
  resolveOrderLink,
  type StoredLink,
} from "./orders.service";
import {
  clearShopInfoCache,
  getShopInfo,
} from "~/.server/services/shop/shop-info.service";

let fake: FakeAdmin;
let logs: LogLine[];
const context = () => ({ shop: SHOP, admin: fake.client });
const at = (dayOfJanuary: number) =>
  new Date(Date.UTC(2026, 0, dayOfJanuary, 12));
const person = (name: string) => ({ name, date: null, location: null });

const GULER_TITLE = "Arda Güler Signed Real Madrid 2026/27 Home Football Shirt";
const CDN = "https://cdn.shopify.com/s/files/1/0000/0001/files";
const ITEM_GONE = "This item is no longer in the order. Select another item.";
const NO_LINK: StoredLink = {
  orderId: null,
  orderName: null,
  lineItemId: null,
  lineItemTitle: null,
};

const gulerWrite = (code: string) =>
  linkedWrite({
    code,
    item: "Real Madrid 2026/27 Home Football Shirt",
    orderId: ORDER_IDS.order141004,
    orderName: "#141004",
    lineItemId: LINE_ITEM_IDS.guler,
    lineItemTitle: GULER_TITLE,
    signers: [person("Arda Güler")],
  });

const orderOf = (id: string): FakeOrder => {
  const found = fake.orders.find((order) => order.id === id);

  if (!found) {
    throw new Error(`No fake order ${id}`);
  }

  return found;
};

const itemOf = (orderId: string, lineItemId: string) => {
  const found = orderOf(orderId).lineItems.find(
    (lineItem) => lineItem.id === lineItemId,
  );

  if (!found) {
    throw new Error(`No fake line item ${lineItemId}`);
  }

  return found;
};

const withFake = (shop: Partial<FakeShop> = {}) => {
  fake = createFakeAdmin({ shop });
};

beforeEach(() => {
  withFake();
  logs = [];
  setLogSink((line) => logs.push(line));
  clearShopInfoCache();
  dropCodeDictionary(SHOP);
});

afterEach(() => {
  setLogSink(null);
  vi.useRealTimers();
});

describe("getShopInfo", () => {
  it("reads the shop once and remembers it for 10 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });

    const shopInfo = await getShopInfo(context());

    expect(shopInfo).toEqual({
      name: "Iconic Shirts Test",
      timeZone: "Europe/London",
      orderNumberFormatPrefix: "#",
      orderNumberFormatSuffix: "",
    });
    expect(await getShopInfo(context())).toEqual(shopInfo);
    expect(fake.callsTo("CoaShopInfo")).toHaveLength(1);

    vi.setSystemTime(Date.now() + 10 * 60 * 1000 + 1);
    await getShopInfo(context());

    expect(fake.callsTo("CoaShopInfo")).toHaveLength(2);
  });

  it("returns null for a failed read and doesn't remember it", async () => {
    fake.failNext("CoaShopInfo", { throw: "network" });

    expect(await getShopInfo(context())).toBeNull();
    expect(await getShopInfo(context())).toMatchObject({
      name: "Iconic Shirts Test",
    });
    expect(fake.callsTo("CoaShopInfo")).toHaveLength(2);
  });

  it("re-throws an expired session as its Response", async () => {
    fake.failNext("CoaShopInfo", { throwResponse: 401 });

    const reading = getShopInfo(context());

    await expect(reading).rejects.toBeInstanceOf(Response);
    await expect(reading).rejects.toMatchObject({ status: 401 });
  });

  it("shares one read between concurrent calls", async () => {
    const [first, second] = await Promise.all([
      getShopInfo(context()),
      getShopInfo(context()),
    ]);

    expect(first).toMatchObject({ name: "Iconic Shirts Test" });
    expect(second).toEqual(first);
    expect(fake.callsTo("CoaShopInfo")).toHaveLength(1);
  });

  it("gives a caller null on its own abort and the others the shared read", async () => {
    const [aborted, other] = await Promise.all([
      getShopInfo(context(), { signal: AbortSignal.abort() }),
      getShopInfo(context()),
    ]);

    expect(aborted).toBeNull();
    expect(other).toMatchObject({ name: "Iconic Shirts Test" });
    expect(fake.callsTo("CoaShopInfo")).toHaveLength(1);
    expect(
      logs.filter((line) => line.event === "shop_info.unavailable"),
    ).toEqual([]);
  });
});

describe("listPickerOrders (spec §4.6, §12.4 #24)", () => {
  it("lists the recent orders newest first, labelled in the shop's time zone", async () => {
    const result = await listPickerOrders(context(), "  ");

    expect(
      fake.callsTo("CoaOrderPicker").map((call) => call.variables),
    ).toEqual([{ first: 10, query: null }]);
    expect(result.more).toBe(false);
    expect(result.orders.map((order) => order.name)).toEqual([
      "#141005",
      "#141004",
      "#141003",
      "#141002",
    ]);
    expect(result.orders[0]).toEqual({
      id: ORDER_IDS.order141005,
      numericId: "5000001005",
      name: "#141005",
      createdLabel: "26 Sep 2026 at 11:05",
      fulfillment: { label: "Unfulfilled", tone: "caution" },
      cancelled: false,
      itemCount: 3,
      itemSummary:
        "Paul Scholes and Ryan Giggs Signed Manchester United 1998-00 Retro Shirt, Wesley Sneijder Signed Galatasaray Home Shirt - 2013-2014, Marco van Basten Signed Netherlands Home Retro Shirt - 1988",
      certificateCount: 0,
    });
  });

  it("leaves removed lines and gift cards out of the item summary", async () => {
    itemOf(ORDER_IDS.order141005, LINE_ITEM_IDS.scholesGiggs).currentQuantity =
      0;
    orderOf(ORDER_IDS.order141005).lineItems.unshift(giftCardLine("1"));

    const [row] = (await listPickerOrders(context(), "")).orders;

    expect(row.itemSummary).toBe(
      "Wesley Sneijder Signed Galatasaray Home Shirt - 2013-2014, Marco van Basten Signed Netherlands Home Retro Shirt - 1988",
    );
  });

  it.each(["141002", "#141002", " #141002 "])(
    "finds the order for %j with and without the shop's symbol",
    async (query) => {
      const result = await listPickerOrders(context(), query);

      expect(
        fake.callsTo("CoaOrderPicker").map((call) => call.variables),
      ).toEqual([{ first: 10, query: "name:141002 OR name:#141002" }]);
      expect(result).toEqual({
        orders: [expect.objectContaining({ name: "#141002" })],
        more: false,
      });
    },
  );

  it("searches the bare number when the shop's order names have no symbol", async () => {
    withFake({ orderNumberFormatPrefix: "" });

    await listPickerOrders(context(), "141002");

    expect(fake.callsTo("CoaOrderPicker")[0].variables.query).toBe(
      "name:141002",
    );
  });

  it("searches the bare number and labels in UTC when the shop can't be read", async () => {
    fake.failNext("CoaShopInfo", { throw: "network" });

    const result = await listPickerOrders(context(), "141002");

    expect(fake.callsTo("CoaOrderPicker")[0].variables.query).toBe(
      "name:141002",
    );
    expect(result.orders[0].createdLabel).toBe("26 Sep 2026 at 10:02");
  });

  it.each(["name:1", "-", "141002 OR (x)"])(
    "answers %j without a Shopify call",
    async (query) => {
      expect(await listPickerOrders(context(), query)).toEqual({
        orders: [],
        more: false,
      });
      expect(fake.calls).toEqual([]);
    },
  );

  it("counts certificates linked by id plus imported ones by name", async () => {
    await createCertificateRow(linkedWrite());
    await createCertificateRow({ code: "IS141002TH", orderName: "#141002" });
    await createCertificateRow({ code: "IS141003DB", orderName: "#141003" });
    await createCertificateRow(linkedWrite(), { shop: OTHER_SHOP });

    const counts = Object.fromEntries(
      (await listPickerOrders(context(), "")).orders.map((order) => [
        order.name,
        order.certificateCount,
      ]),
    );

    expect(counts).toEqual({
      "#141002": 2,
      "#141003": 1,
      "#141004": 0,
      "#141005": 0,
    });
  });

  it("reports more when Shopify has more recent orders than one page", async () => {
    const extraOrders = Array.from({ length: 8 }, (_unused, index) => ({
      ...orderOf(ORDER_IDS.order141002),
      id: `gid://shopify/Order/500000200${index}`,
      name: `#14200${index}`,
      createdAt: `2026-09-25T10:0${index}:00Z`,
    }));

    fake.orders.push(...extraOrders);

    const result = await listPickerOrders(context(), "");

    expect(result.orders).toHaveLength(10);
    expect(result.more).toBe(true);
  });

  it("lets an access error propagate for the route to report", async () => {
    fake.failNext("CoaOrderPicker", { throw: "access_denied" });

    const listing = listPickerOrders(context(), "");

    await expect(listing).rejects.toBeInstanceOf(AdminApiError);
    await expect(listing).rejects.toMatchObject({
      kind: "access_denied",
      reason: "scope",
    });
  });
});

describe("getPickerOrder (spec §4.6, §6.4.9)", () => {
  it("keeps an item open while it has fewer certificates than its quantity", async () => {
    const first = await createCertificateRow(gulerWrite("IS141004AGRM2627"));

    const detail = await getPickerOrder(context(), ORDER_IDS.order141004);

    expect(detail).toEqual({
      order: {
        id: ORDER_IDS.order141004,
        numericId: "5000001004",
        name: "#141004",
        createdLabel: "26 Sep 2026 at 11:04",
        fulfillment: { label: "Unfulfilled", tone: "caution" },
        cancelled: false,
        itemCount: 2,
        itemSummary: GULER_TITLE,
        certificateCount: 1,
      },
      lineItems: [
        {
          id: LINE_ITEM_IDS.guler,
          title: GULER_TITLE,
          variantTitle: null,
          quantity: 2,
          imageUrl: `${CDN}/li-041.jpg`,
          product: {
            id: "gid://shopify/Product/70001041",
            title: GULER_TITLE,
            status: "ACTIVE",
            imageUrl: `${CDN}/p-041.jpg`,
          },
          certificates: [{ id: first.id, code: "IS141004AGRM2627" }],
          possibleCertificates: [],
          includesThis: false,
          state: "open",
        },
      ],
      legacyCertificates: [],
      orderCertificates: [
        {
          id: first.id,
          code: "IS141004AGRM2627",
          signers: "Arda Güler",
          item: "Real Madrid 2026/27 Home Football Shirt",
          lineItemId: LINE_ITEM_IDS.guler,
        },
      ],
      takenCodes: ["IS141004AGRM2627"],
    });
  });

  it("completes an item once every unit has a certificate", async () => {
    await createCertificateRow(gulerWrite("IS141004AGRM2627"));
    await createCertificateRow(gulerWrite("IS141004AGRM2627-2"));

    const detail = await getPickerOrder(context(), ORDER_IDS.order141004);

    expect(detail?.lineItems[0].state).toBe("complete");
  });

  it("leaves the certificate being edited out and marks its item", async () => {
    const edited = await createCertificateRow(gulerWrite("IS141004AGRM2627"));
    const other = await createCertificateRow(gulerWrite("IS141004AGRM2627-2"));

    const detail = await getPickerOrder(
      context(),
      ORDER_IDS.order141004,
      edited.id,
    );

    expect(detail?.lineItems[0]).toMatchObject({
      state: "open",
      includesThis: true,
      certificates: [{ id: other.id, code: other.code }],
    });
    expect(
      detail?.orderCertificates.map((certificate) => certificate.id),
    ).toEqual([other.id]);
    expect(detail?.takenCodes).toEqual([other.code]);
  });

  it("marks a refunded or removed item and counts only live units", async () => {
    itemOf(ORDER_IDS.order141004, LINE_ITEM_IDS.guler).currentQuantity = 0;

    const detail = await getPickerOrder(context(), ORDER_IDS.order141004);

    expect(detail?.lineItems[0].state).toBe("removed");
    expect(detail?.order).toMatchObject({ itemCount: 0, itemSummary: "" });
  });

  it("leaves gift cards out", async () => {
    orderOf(ORDER_IDS.order141004).lineItems.push(giftCardLine("1"));

    const detail = await getPickerOrder(context(), ORDER_IDS.order141004);

    expect(detail?.lineItems.map((item) => item.id)).toEqual([
      LINE_ITEM_IDS.guler,
    ]);
    expect(detail?.order.itemCount).toBe(2);
  });

  it("shows an imported certificate on the item it clearly matches and lists the rest", async () => {
    const lewandowski = await createCertificateRow(
      {
        code: "IS141002RLBM1516",
        item: "Bayern Munich Football Shirt - 2015-16 Home",
        orderName: "#141002",
        signers: [person("Robert Lewandowski")],
      },
      { createdAt: at(1) },
    );
    const henry = await createCertificateRow(
      {
        code: "IS141002THARS",
        item: "Arsenal Home Shirt",
        orderName: "#141002",
        signers: [person("Thierry Henry")],
      },
      { createdAt: at(2) },
    );

    const detail = await getPickerOrder(context(), ORDER_IDS.order141002);

    expect(
      detail?.lineItems.map((item) => [
        item.id,
        item.possibleCertificates,
        item.state,
      ]),
    ).toEqual([
      [
        LINE_ITEM_IDS.bayern,
        [{ id: lewandowski.id, code: "IS141002RLBM1516" }],
        "open",
      ],
      [LINE_ITEM_IDS.dortmund, [], "open"],
    ]);
    expect(detail?.legacyCertificates).toEqual([
      { id: henry.id, code: "IS141002THARS" },
    ]);
    expect(
      detail?.orderCertificates.map((certificate) => certificate.lineItemId),
    ).toEqual([null, null]);
    expect(detail?.order.certificateCount).toBe(2);
  });

  it("marks only the edited certificate's item in an order with several items", async () => {
    const edited = await createCertificateRow(
      linkedWrite({
        code: "IS141002RLBVB1112",
        lineItemId: LINE_ITEM_IDS.dortmund,
        lineItemTitle: "Dortmund title",
      }),
    );

    const detail = await getPickerOrder(
      context(),
      ORDER_IDS.order141002,
      edited.id,
    );

    expect(
      detail?.lineItems.map((item) => [item.id, item.includesThis]),
    ).toEqual([
      [LINE_ITEM_IDS.bayern, false],
      [LINE_ITEM_IDS.dortmund, true],
    ]);
  });

  it("lists every code with the order's number except the excluded one", async () => {
    const edited = await createCertificateRow(linkedWrite());
    await createCertificateRow(
      linkedWrite({
        code: "IS141002RLBVB1112",
        lineItemId: LINE_ITEM_IDS.dortmund,
        lineItemTitle: "Dortmund title",
      }),
    );
    await createCertificateRow({ code: "IS141002TH", orderName: "#141002" });
    await createCertificateRow({ code: "IS141003DB", orderName: "#141003" });
    await createCertificateRow(
      { code: "IS141002XX", orderName: "#141002" },
      { shop: OTHER_SHOP },
    );

    const detail = await getPickerOrder(
      context(),
      ORDER_IDS.order141002,
      edited.id,
    );

    expect(detail?.takenCodes).toEqual(["IS141002RLBVB1112", "IS141002TH"]);
  });

  it("is null for an order outside the 60-day window", async () => {
    orderOf(ORDER_IDS.order141003).outsideWindow = true;

    expect(await getPickerOrder(context(), ORDER_IDS.order141003)).toBeNull();
  });

  it("lets an access error propagate for the route to report", async () => {
    fake.failNext("CoaOrderLineItems", {
      throw: "access_denied",
      message: "This app is not approved to access the Order object.",
    });

    await expect(
      getPickerOrder(context(), ORDER_IDS.order141004),
    ).rejects.toMatchObject({
      kind: "access_denied",
      reason: "customer_data",
    });
  });
});

describe("certificatesForOrder on a legacy certificate's page", () => {
  it("also lists certificates created in the app for that order", async () => {
    const legacy = await createCertificateRow({
      code: "IS141909ARS0",
      orderName: "#141909",
    });
    const created = await createCertificateRow(
      linkedWrite({
        code: "IS141909THARS",
        orderId: "gid://shopify/Order/5000001909",
        orderName: "#141909",
      }),
    );

    const rows = await certificatesForOrder(
      SHOP,
      { orderId: null, orderName: "#141909" },
      legacy.id,
    );

    expect(rows.map((row) => row.id)).toEqual([created.id]);
  });
});

describe("getOrderCard", () => {
  const card = (lineItemId: string = LINE_ITEM_IDS.guler) =>
    getOrderCard(
      context(),
      { orderId: ORDER_IDS.order141004, lineItemId },
      { signal: AbortSignal.timeout(3_000) },
    );

  it("reads the linked item's quantity and image", async () => {
    expect(await card()).toEqual({
      createdLabel: "26 Sep 2026 at 11:04",
      fulfillment: { label: "Unfulfilled", tone: "caution" },
      cancelled: false,
      selectableItems: 1,
      lineItem: {
        variantTitle: null,
        quantity: 2,
        imageUrl: `${CDN}/li-041.jpg`,
      },
    });
  });

  it("has no line item once the item is removed from the order", async () => {
    itemOf(ORDER_IDS.order141004, LINE_ITEM_IDS.guler).currentQuantity = 0;

    expect(await card()).toMatchObject({ selectableItems: 0, lineItem: null });
  });

  it("is null when the order can't be read, logged with the reason", async () => {
    fake.failNext("CoaOrderLineItems", { throw: "network" });

    expect(await card()).toBeNull();

    orderOf(ORDER_IDS.order141004).outsideWindow = true;

    expect(await card()).toBeNull();
    expect(
      logs
        .filter((line) => line.event === "orders.card_unavailable")
        .map((line) => [line.shop, line.kind]),
    ).toEqual([
      [SHOP, "network"],
      [SHOP, "not_found"],
    ]);
  });

  it.each(["CoaOrderLineItems", "CoaShopInfo"])(
    "re-throws an expired session on %s as its Response",
    async (operation) => {
      fake.failNext(operation, { throwResponse: 401 });

      const reading = card();

      await expect(reading).rejects.toBeInstanceOf(Response);
      await expect(reading).rejects.toMatchObject({ status: 401 });
    },
  );
});

describe("resolveOrderLink (spec §4.6 Create and update)", () => {
  const pick = (lineItemId: string = LINE_ITEM_IDS.guler) => ({
    order: { id: ORDER_IDS.order141004, name: "#999" },
    lineItem: { id: lineItemId, title: "posted title" },
  });
  const posted = (lineItemId: string = LINE_ITEM_IDS.guler): StoredLink => ({
    orderId: ORDER_IDS.order141004,
    orderName: "#999",
    lineItemId,
    lineItemTitle: "posted title",
  });

  it("keeps the stored link when no order is posted", async () => {
    const legacy: StoredLink = { ...NO_LINK, orderName: "#141909" };
    const none = { order: null, lineItem: null };

    expect(await resolveOrderLink(context(), none, legacy)).toEqual({
      ok: true,
      link: legacy,
      capacity: null,
    });
    expect(await resolveOrderLink(context(), none, null)).toEqual({
      ok: true,
      link: NO_LINK,
      capacity: null,
    });
    expect(fake.calls).toEqual([]);
  });

  it("keeps the stored link when an order is posted without an item, without reading Shopify", async () => {
    const legacy: StoredLink = { ...NO_LINK, orderName: "#141909" };
    const orderOnly = { order: pick().order, lineItem: null };

    expect(await resolveOrderLink(context(), orderOnly, legacy)).toEqual({
      ok: true,
      link: legacy,
      capacity: null,
    });
    expect(fake.calls).toEqual([]);
  });

  it("keeps the stored snapshot for the same line item without reading Shopify", async () => {
    const stored: StoredLink = {
      orderId: ORDER_IDS.order141004,
      orderName: "#141004",
      lineItemId: LINE_ITEM_IDS.guler,
      lineItemTitle: "stored title",
    };

    expect(await resolveOrderLink(context(), pick(), stored)).toEqual({
      ok: true,
      link: stored,
      capacity: null,
    });
    expect(fake.calls).toEqual([]);
  });

  it("stores Shopify's order name and item title for a new pick", async () => {
    expect(await resolveOrderLink(context(), pick(), null)).toEqual({
      ok: true,
      link: {
        orderId: ORDER_IDS.order141004,
        orderName: "#141004",
        lineItemId: LINE_ITEM_IDS.guler,
        lineItemTitle: GULER_TITLE,
      },
      capacity: 2,
    });
  });

  it("refuses an item that is no longer in the order", async () => {
    itemOf(ORDER_IDS.order141004, LINE_ITEM_IDS.guler).currentQuantity = 0;

    expect(await resolveOrderLink(context(), pick(), null)).toEqual({
      ok: false,
      fieldErrors: { lineItem: ITEM_GONE },
    });
  });

  it("refuses a gift card", async () => {
    const giftCard = giftCardLine("1");

    orderOf(ORDER_IDS.order141004).lineItems.push(giftCard);

    expect(await resolveOrderLink(context(), pick(giftCard.id), null)).toEqual({
      ok: false,
      fieldErrors: { lineItem: ITEM_GONE },
    });
  });

  it("stores the posted snapshot without a capacity when Shopify returns no order", async () => {
    orderOf(ORDER_IDS.order141004).outsideWindow = true;

    expect(await resolveOrderLink(context(), pick(), null)).toEqual({
      ok: true,
      link: posted(),
      capacity: null,
    });
  });

  it("stores the posted snapshot without a capacity when the read fails", async () => {
    fake.failNext("CoaOrderLineItems", { throwResponse: 500 });

    expect(await resolveOrderLink(context(), pick(), null)).toEqual({
      ok: true,
      link: posted(),
      capacity: null,
    });
    expect(
      logs.filter((line) => line.event === "orders.link_unverified"),
    ).toMatchObject([{ shop: SHOP, kind: "http" }]);
  });

  it("re-throws an expired session as its Response", async () => {
    fake.failNext("CoaOrderLineItems", { throwResponse: 401 });

    const resolving = resolveOrderLink(context(), pick(), null);

    await expect(resolving).rejects.toBeInstanceOf(Response);
    await expect(resolving).rejects.toMatchObject({ status: 401 });
  });
});
