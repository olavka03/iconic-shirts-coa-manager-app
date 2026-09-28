import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLogSink, type LogLine } from "~/.server/logging/logger.service";
import { loader } from "~/routes/api/orders.route";
import { dropCodeDictionary } from "~/.server/services/codes/codes.service";
import { clearShopInfoCache } from "~/.server/services/shop/shop-info.service";
import { authenticate } from "~/.server/shopify/shopify-app.config";
import {
  createFakeAdmin,
  type FakeAdmin,
  type FakeShop,
} from "../../fakes/admin-api.fake";
import {
  giftCardLine,
  LINE_ITEM_IDS,
  ORDER_IDS,
  type FakeOrder,
} from "../../fakes/orders.fake";
import {
  createCertificateRow,
  linkedWrite,
  SHOP,
} from "../../helpers/certificate-row.factory";
import {
  getRequest,
  mockAdmin,
  readJson,
  routeArguments,
} from "../route-test.utils";

vi.mock("~/.server/shopify/shopify-app.config", () => ({
  authenticate: { admin: vi.fn() },
}));

let fake: FakeAdmin;
let logs: LogLine[];

const DORTMUND_TITLE =
  "Robert Lewandowski Signed Original Borussia Dortmund Football Shirt - 2011-12 Home";
const NOT_APPROVED =
  "This app is not approved to access the Order object. See https://shopify.dev/docs/apps/launch/protected-customer-data for more details.";
// The customer-data guard's term rule (tests/guards/no-customer-data.test.ts, spec §12.2).
const ALLOWED_TERM = /^(name|status):[^:\s()"'\\]+$/;

const person = (name: string) => ({ name, date: null, location: null });
const january = (day: number) => new Date(Date.UTC(2026, 0, day, 12));
const numericId = (gid: string) => gid.replace("gid://shopify/Order/", "");

const orders = async (search = "") =>
  readJson(await loader(routeArguments(getRequest(`/api/orders${search}`))));
const pickerQueries = () =>
  fake.callsTo("CoaOrderPicker").map((call) => call.variables.query);

function installFakeShop(shop: Partial<FakeShop> = {}) {
  fake = createFakeAdmin({ shop });
  mockAdmin(fake);
}

function orderOf(id: string): FakeOrder {
  const found = fake.orders.find((order) => order.id === id);

  if (!found) {
    throw new Error(`The fake has no order ${id}.`);
  }

  return found;
}

function removeItem(orderId: string, lineItemId: string) {
  const item = orderOf(orderId).lineItems.find(
    (lineItem) => lineItem.id === lineItemId,
  );

  if (!item) {
    throw new Error(`The fake has no line item ${lineItemId}.`);
  }

  item.currentQuantity = 0;
}

beforeEach(() => {
  installFakeShop();
  logs = [];
  setLogSink((line) => logs.push(line));
  clearShopInfoCache();
  dropCodeDictionary(SHOP);
});

afterEach(() => {
  setLogSink(null);
});

describe("GET /api/orders?q= (spec §5, §12.5)", () => {
  it("lists the newest orders first when nothing is typed", async () => {
    const { status, body } = await orders();

    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, more: false });
    expect(
      (body as { orders: { name: string }[] }).orders.map(
        (order) => order.name,
      ),
    ).toEqual(["#141005", "#141004", "#141003", "#141002"]);
    expect(pickerQueries()).toEqual([null]);
  });

  it.each(["?q=141002", "?q=%23141002"])(
    "searches the number with and without the shop's symbol (%s)",
    async (search) => {
      const { status, body } = await orders(search);

      expect(status).toBe(200);
      expect(body).toEqual({
        ok: true,
        orders: [expect.objectContaining({ name: "#141002" })],
        more: false,
      });
      expect(pickerQueries()).toEqual(["name:141002 OR name:#141002"]);
    },
  );

  it("searches the bare number when the shop's order names have no symbol", async () => {
    installFakeShop({ orderNumberFormatPrefix: "" });

    await orders("?q=141002");

    expect(pickerQueries()).toEqual(["name:141002"]);
  });

  it("searches the bare number when the shop can't be read", async () => {
    fake.failNext("CoaShopInfo", { throw: "network" });

    expect((await orders("?q=141002")).status).toBe(200);
    expect(pickerQueries()).toEqual(["name:141002"]);
  });

  it("sends typed operators as part of a single name term", async () => {
    expect(await orders("?q=141002%20OR%20x")).toEqual({
      status: 200,
      body: { ok: true, orders: [], more: false },
    });
    expect(pickerQueries()).toEqual(["name:141002ORX OR name:#141002ORX"]);
  });

  it.each(["?q=name:1", "?q=-"])(
    "answers %s with no orders and no Shopify call",
    async (search) => {
      expect(await orders(search)).toEqual({
        status: 200,
        body: { ok: true, orders: [], more: false },
      });
      expect(fake.calls).toEqual([]);
    },
  );

  it("leaves removed lines and gift cards out of the item summary", async () => {
    removeItem(ORDER_IDS.order141005, LINE_ITEM_IDS.scholesGiggs);
    orderOf(ORDER_IDS.order141005).lineItems.unshift(giftCardLine("1"));

    const { body } = await orders("?q=141005");

    expect(body).toMatchObject({
      ok: true,
      orders: [
        {
          name: "#141005",
          itemSummary:
            "Wesley Sneijder Signed Galatasaray Home Shirt - 2013-2014, Marco van Basten Signed Netherlands Home Retro Shirt - 1988",
        },
      ],
    });
  });

  it("counts linked certificates and imported ones with the order's name", async () => {
    await createCertificateRow(linkedWrite());
    await createCertificateRow({ code: "IS141002TH", orderName: "#141002" });

    expect((await orders("?q=141002")).body).toMatchObject({
      orders: [{ name: "#141002", certificateCount: 2 }],
    });
  });

  it("sends Shopify name: and status: terms only", async () => {
    const searches = [
      "141002",
      "%23141002",
      "141002%20OR%20x",
      "EN1001",
      "1001-A",
      "customer%3Ax",
      "email%3Aa%40b.c",
      "141002)%20OR%20(x",
    ];

    for (const search of searches) {
      await orders(`?q=${search}`);
    }

    const terms = pickerQueries().flatMap((query) =>
      String(query ?? "")
        .split(/\s+/)
        .filter((term) => term !== "" && term !== "OR" && term !== "AND"),
    );

    expect(terms.length).toBeGreaterThan(0);
    expect(terms.filter((term) => !ALLOWED_TERM.test(term))).toEqual([]);
  });
});

describe("GET /api/orders?id= (spec §5, §6.4.9)", () => {
  async function orderWithHistory() {
    orderOf(ORDER_IDS.order141002).lineItems.push(giftCardLine("1"));

    const importedBayern = await createCertificateRow(
      {
        code: "IS141002RLFCB1516",
        item: "Bayern Munich Football Shirt - 2015-16 Home",
        orderName: "#141002",
        signers: [person("Robert Lewandowski")],
      },
      { createdAt: january(1) },
    );
    const importedArsenal = await createCertificateRow(
      {
        code: "IS141002THARS",
        item: "Arsenal Home Shirt",
        orderName: "#141002",
        signers: [person("Thierry Henry")],
      },
      { createdAt: january(2) },
    );
    const edited = await createCertificateRow(linkedWrite());
    const dortmund = await createCertificateRow(
      linkedWrite({
        code: "IS141002RLBD1112",
        item: "Borussia Dortmund Football Shirt - 2011-12 Home",
        lineItemId: LINE_ITEM_IDS.dortmund,
        lineItemTitle: DORTMUND_TITLE,
      }),
    );

    return { importedBayern, importedArsenal, edited, dortmund };
  }

  it("describes each item's certificates and state, leaving the edited certificate out", async () => {
    const { importedBayern, importedArsenal, edited, dortmund } =
      await orderWithHistory();

    const { status, body } = await orders(
      `?id=${numericId(ORDER_IDS.order141002)}&exclude=${edited.id}`,
    );

    expect(status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      detail: {
        order: {
          id: ORDER_IDS.order141002,
          name: "#141002",
          certificateCount: 4,
        },
        lineItems: [
          {
            id: LINE_ITEM_IDS.bayern,
            certificates: [],
            possibleCertificates: [
              { id: importedBayern.id, code: "IS141002RLFCB1516" },
            ],
            includesThis: true,
            state: "open",
          },
          {
            id: LINE_ITEM_IDS.dortmund,
            certificates: [{ id: dortmund.id, code: "IS141002RLBD1112" }],
            possibleCertificates: [],
            includesThis: false,
            state: "complete",
          },
        ],
        legacyCertificates: [{ id: importedArsenal.id, code: "IS141002THARS" }],
        orderCertificates: [
          {
            id: importedBayern.id,
            code: "IS141002RLFCB1516",
            signers: "Robert Lewandowski",
            item: "Bayern Munich Football Shirt - 2015-16 Home",
            lineItemId: null,
          },
          {
            id: importedArsenal.id,
            code: "IS141002THARS",
            signers: "Thierry Henry",
            item: "Arsenal Home Shirt",
            lineItemId: null,
          },
          {
            id: dortmund.id,
            code: "IS141002RLBD1112",
            signers: "Robert Lewandowski",
            item: "Borussia Dortmund Football Shirt - 2011-12 Home",
            lineItemId: LINE_ITEM_IDS.dortmund,
          },
        ],
        takenCodes: ["IS141002RLBD1112", "IS141002RLFCB1516", "IS141002THARS"],
      },
    });
    expect(
      (body as { detail: { lineItems: unknown[] } }).detail.lineItems,
    ).toHaveLength(2);
  });

  it("counts the edited certificate on its item when nothing is excluded", async () => {
    const { edited } = await orderWithHistory();

    const { body } = await orders(`?id=${numericId(ORDER_IDS.order141002)}`);

    expect(body).toMatchObject({
      detail: {
        lineItems: [
          {
            certificates: [{ id: edited.id, code: "IS141002RLBM1516" }],
            includesThis: false,
            state: "complete",
          },
          { state: "complete" },
        ],
      },
    });
  });

  it("marks an item that left the order as removed", async () => {
    removeItem(ORDER_IDS.order141004, LINE_ITEM_IDS.guler);

    const { body } = await orders(`?id=${numericId(ORDER_IDS.order141004)}`);

    expect(body).toMatchObject({
      detail: { lineItems: [{ id: LINE_ITEM_IDS.guler, state: "removed" }] },
    });
  });

  it("answers detail null for an order outside the 60-day window", async () => {
    orderOf(ORDER_IDS.order141003).outsideWindow = true;

    expect(await orders(`?id=${numericId(ORDER_IDS.order141003)}`)).toEqual({
      status: 200,
      body: { ok: true, detail: null },
    });
  });
});

describe("GET /api/orders failures (spec §5)", () => {
  const accessEvents = () =>
    logs.filter((line) => line.event === "orders.access_denied");

  it("reports missing order access as a store state and logs the reason", async () => {
    fake.failNext("CoaOrderPicker", { throw: "access_denied" });

    expect(await orders()).toEqual({
      status: 200,
      body: { ok: false, formError: "orders_access" },
    });
    expect(accessEvents()).toMatchObject([
      { level: "error", shop: SHOP, reason: "scope" },
    ]);
  });

  it("reports the protected customer data refusal the same way", async () => {
    fake.failNext("CoaOrderLineItems", {
      throw: "access_denied",
      message: NOT_APPROVED,
    });

    expect(await orders(`?id=${numericId(ORDER_IDS.order141004)}`)).toEqual({
      status: 200,
      body: { ok: false, formError: "orders_access" },
    });
    expect(accessEvents()).toMatchObject([
      { shop: SHOP, reason: "customer_data", message: NOT_APPROVED },
    ]);
  });

  it.each(["network", "timeout"] as const)(
    "answers 503 when Shopify fails with %s",
    async (failure) => {
      fake.failNext("CoaOrderPicker", { throw: failure });

      expect(await orders("?q=141002")).toEqual({
        status: 503,
        body: { ok: false, formError: "unavailable" },
      });
    },
  );

  it.each([
    "?id=abc",
    "?id=123456789012345678901",
    "?id=5000001004&exclude=abc",
    "?id=5000001004&exclude=",
    "?id=5000001004&exclude=1234567890",
    "?q=141002&id=5000001002",
    "?q=141002&exclude=x",
  ])("answers 422 for %s without a Shopify call", async (search) => {
    expect(await orders(search)).toEqual({
      status: 422,
      body: { ok: false },
    });
    expect(fake.calls).toEqual([]);
  });

  it("lets an expired session from authenticate.admin propagate", async () => {
    const expired = new Response(null, { status: 401 });

    vi.mocked(authenticate.admin).mockRejectedValueOnce(expired);

    await expect(
      loader(routeArguments(getRequest("/api/orders?q=141002"))),
    ).rejects.toBe(expired);
  });

  it("lets an expired session from the order read propagate", async () => {
    fake.failNext("CoaOrderLineItems", { throwResponse: 401 });

    await expect(
      loader(
        routeArguments(
          getRequest(`/api/orders?id=${numericId(ORDER_IDS.order141004)}`),
        ),
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
});
