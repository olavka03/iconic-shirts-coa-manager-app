import { describe, expect, it } from "vitest";
import type {
  OrderDetail,
  OrderItemRow,
  OrderRow,
} from "~/features/orders/types/orders.types";
import {
  itemRowLabel,
  itemStatus,
  orderRowLabel,
  orderRowFacts,
  pickerAnnouncement,
  pickerView,
  shouldAutoSkip,
  variantQuantityLine,
  type SearchState,
} from "./picker-view.utils";
import { orderDetail } from "../../../../tests/helpers/certificate-form.factory";
import { testId } from "../../../../tests/helpers/test-ids.utils";

function order(name: string, overrides: Partial<OrderRow> = {}): OrderRow {
  const digits = name.replace(/\D/g, "");

  return {
    id: `gid://shopify/Order/5${digits}`,
    numericId: `5${digits}`,
    name,
    createdLabel: "26 Sep 2026 at 14:05",
    fulfillment: { label: "Unfulfilled", tone: "caution" },
    cancelled: false,
    itemCount: 2,
    itemSummary: "Bayern Munich Football Shirt - 2015-16 Home",
    certificateCount: 1,
    ...overrides,
  };
}

function item(overrides: Partial<OrderItemRow> = {}): OrderItemRow {
  return {
    id: "gid://shopify/LineItem/1",
    title:
      "Robert Lewandowski Signed Bayern Munich Football Shirt - 2015-16 Home",
    variantTitle: null,
    quantity: 1,
    imageUrl: null,
    product: null,
    certificates: [],
    possibleCertificates: [],
    includesThis: false,
    state: "open",
    ...overrides,
  };
}

function detail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return orderDetail(order("#141002"), [item()], overrides);
}

const RECENT = [
  order("#141005"),
  order("#141004"),
  order("#141003"),
  order("#141002"),
];
const IDLE: SearchState = {
  recent: RECENT,
  results: null,
  pending: null,
  recentFailure: null,
  searchFailure: null,
};
const WINDOW = "Orders placed more than 60 days ago can't be selected.";
const certificateReference = (id: string, code: string) => ({ id, code });

describe("pickerView", () => {
  it("shows the spinner while the first recent list loads", () => {
    const view = pickerView({ ...IDLE, recent: null, pending: "recent" }, "");

    expect(view.kind).toBe("loading");
    expect(view.rows).toEqual([]);
  });

  it("stays loading while the list was never requested", () => {
    expect(pickerView({ ...IDLE, recent: null }, "").kind).toBe("loading");
  });

  it("shows the recent orders for an empty query", () => {
    expect(pickerView(IDLE, "")).toMatchObject({
      kind: "recent",
      header: "Recent orders",
      rows: RECENT,
      hint: null,
      exactMatch: null,
    });
    expect(pickerView(IDLE, "   ").kind).toBe("recent");
  });

  it("keeps the recent orders while a background refresh runs", () => {
    expect(pickerView({ ...IDLE, pending: "recent" }, "").kind).toBe("recent");
  });

  it("keeps the filtered recent rows while searching", () => {
    const view = pickerView({ ...IDLE, pending: "search" }, "14100");

    expect(view.kind).toBe("searching");
    expect(view.header).toBe("Recent orders");
    expect(view.rows.map((row) => row.name)).toEqual([
      "#141005",
      "#141004",
      "#141003",
      "#141002",
    ]);
    expect(
      pickerView({ ...IDLE, pending: "search" }, "141003").rows.map(
        (row) => row.name,
      ),
    ).toEqual(["#141003"]);
  });

  it("counts the results of the current query", () => {
    const one = pickerView(
      {
        ...IDLE,
        results: { term: "141909", rows: [order("#141909")], more: false },
      },
      "#141909",
    );
    const three = pickerView(
      {
        ...IDLE,
        results: {
          term: "1419",
          rows: [order("#141909"), order("#141908"), order("#141907")],
          more: false,
        },
      },
      "1419",
    );
    const ten = [...Array(10).keys()].map((index) => order(`#1419${index}0`));
    const more = pickerView(
      { ...IDLE, results: { term: "1419", rows: ten, more: true } },
      "1419",
    );

    expect(one).toMatchObject({ kind: "results", header: "1 order" });
    expect(three).toMatchObject({ kind: "results", header: "3 orders" });
    expect(three.rows).toHaveLength(3);
    expect(more).toMatchObject({
      kind: "results",
      header: "10 most recent matches",
    });
  });

  it("keeps matching recent rows with a hint when the server finds nothing", () => {
    const view = pickerView(
      { ...IDLE, results: { term: "14100", rows: [], more: false } },
      "14100",
    );

    expect(view).toMatchObject({
      kind: "partial",
      header: "Recent orders",
      hint: "Enter the full order number to search all orders.",
    });
    expect(view.rows).toHaveLength(4);
  });

  it("gives the newest recent order as the example when nothing matches", () => {
    const view = pickerView(
      { ...IDLE, results: { term: "999999", rows: [], more: false } },
      "999999",
    );

    expect(view).toMatchObject({
      kind: "no_results",
      header: "No orders found",
      rows: [],
      emptyText: `Check the number and enter it in full, for example #141005. ${WINDOW}`,
    });
  });

  it("leaves the example out when there is no recent order", () => {
    const view = pickerView(
      {
        ...IDLE,
        recent: [],
        results: { term: "999999", rows: [], more: false },
      },
      "999999",
    );

    expect(view.kind).toBe("no_results");
    expect(view.emptyText).toBe(
      `Check the number and enter it in full. ${WINDOW}`,
    );
  });

  it("says there are no orders in the last 60 days", () => {
    expect(pickerView({ ...IDLE, recent: [] }, "")).toMatchObject({
      kind: "no_orders",
      header: "No orders in the last 60 days",
      emptyText: WINDOW,
    });
  });

  it("shows a failure instead of rows", () => {
    expect(
      pickerView({ ...IDLE, searchFailure: "error" }, "141909"),
    ).toMatchObject({ kind: "error", rows: [] });
    expect(
      pickerView({ ...IDLE, recent: null, recentFailure: "error" }, ""),
    ).toMatchObject({ kind: "error" });
    expect(
      pickerView({ ...IDLE, recent: null, recentFailure: "no_access" }, "")
        .kind,
    ).toBe("no_access");
    expect(
      pickerView({ ...IDLE, searchFailure: "no_access" }, "141909").kind,
    ).toBe("no_access");
  });

  it("keeps the list's failure and the search's failure to their own query", () => {
    expect(pickerView({ ...IDLE, searchFailure: "error" }, "").kind).toBe(
      "recent",
    );
    expect(
      pickerView({ ...IDLE, recent: null, recentFailure: "error" }, "141909")
        .kind,
    ).toBe("no_results");
  });

  it("treats a query the server would reject like an empty result", () => {
    expect(pickerView(IDLE, "141-").kind).toBe("partial");
    expect(pickerView({ ...IDLE, recent: [] }, "-").kind).toBe("no_results");
  });

  it("ignores results that belong to an earlier query", () => {
    const view = pickerView(
      {
        ...IDLE,
        results: { term: "141909", rows: [order("#141909")], more: false },
      },
      "141908",
    );

    expect(view.kind).toBe("no_results");
    expect(view.exactMatch).toBeNull();
  });

  it("finds the exact match only among the results of the current query", () => {
    const rows = [order("#141909"), order("#1419090")];
    const results = pickerView(
      { ...IDLE, results: { term: "141909", rows, more: false } },
      "#141909",
    );
    const searching = pickerView(
      {
        ...IDLE,
        recent: [order("#141909")],
        pending: "search",
        results: { term: "141909", rows, more: false },
      },
      "141909",
    );
    const partial = pickerView(
      { ...IDLE, recent: [order("#141909")] },
      "141909",
    );

    expect(results.exactMatch?.name).toBe("#141909");
    expect(searching.exactMatch).toBeNull();
    expect(partial.exactMatch).toBeNull();
  });

  it("has no exact match when two names share the number", () => {
    const view = pickerView(
      {
        ...IDLE,
        results: {
          term: "141909",
          rows: [order("#141909"), order("#141909-UK")],
          more: false,
        },
      },
      "141909",
    );

    expect(view.exactMatch).toBeNull();
  });
});

describe("pickerView without a recent list", () => {
  const FOUND = order("#141909");
  const NO_LIST: SearchState = { ...IDLE, recent: null };

  it("shows the search results after the recent list failed to load", () => {
    const results = { term: "141909", rows: [FOUND], more: false };

    expect(
      pickerView({ ...NO_LIST, results, recentFailure: "error" }, "141909"),
    ).toMatchObject({ kind: "results", header: "1 order", exactMatch: FOUND });
    expect(pickerView({ ...NO_LIST, results }, "141909").kind).toBe("results");
  });

  it("shows the spinner while a search runs and there are no rows to keep", () => {
    expect(
      pickerView(
        { ...NO_LIST, pending: "search", recentFailure: "error" },
        "141909",
      ).kind,
    ).toBe("loading");
  });

  it("says nothing was found, without an example, when the list failed", () => {
    const view = pickerView(
      {
        ...NO_LIST,
        results: { term: "999999", rows: [], more: false },
        recentFailure: "error",
      },
      "999999",
    );

    expect(view.kind).toBe("no_results");
    expect(view.emptyText).toBe(
      `Check the number and enter it in full. ${WINDOW}`,
    );
  });

  it("keeps the list's failure while the text can't be searched", () => {
    expect(pickerView({ ...NO_LIST, recentFailure: "error" }, "#").kind).toBe(
      "error",
    );
    expect(
      pickerView({ ...NO_LIST, recentFailure: "no_access" }, "#").kind,
    ).toBe("no_access");
  });

  it("waits for the first list before saying a search found nothing", () => {
    const empty = { term: "141909", rows: [], more: false };

    expect(
      pickerView({ ...NO_LIST, pending: "recent", results: empty }, "141909")
        .kind,
    ).toBe("loading");
    expect(
      pickerView(
        {
          ...NO_LIST,
          pending: "recent",
          results: { ...empty, rows: [FOUND] },
        },
        "141909",
      ).kind,
    ).toBe("results");
  });

  it("never shows a spinner for a typed query while nothing is loading", () => {
    const lists = [null, [], RECENT];
    const resultSets = [
      null,
      { term: "141909", rows: [], more: false },
      { term: "141909", rows: [FOUND], more: false },
    ];
    const kinds = lists.flatMap((recent) =>
      resultSets.flatMap((results) =>
        ["141909", "#", "14100"].map(
          (query) => pickerView({ ...IDLE, recent, results }, query).kind,
        ),
      ),
    );

    expect(kinds).not.toContain("loading");
  });
});

describe("pickerAnnouncement", () => {
  it("announces the list header and result counts, not transient states", () => {
    expect(pickerAnnouncement(pickerView(IDLE, ""))).toBe("Recent orders");
    expect(
      pickerAnnouncement(
        pickerView(
          {
            ...IDLE,
            results: { term: "141909", rows: [order("#141909")], more: false },
          },
          "141909",
        ),
      ),
    ).toBe("1 order");
    expect(
      pickerAnnouncement(
        pickerView(
          { ...IDLE, results: { term: "999999", rows: [], more: false } },
          "999999",
        ),
      ),
    ).toBe("No orders found");
    expect(
      pickerAnnouncement(pickerView({ ...IDLE, pending: "search" }, "1410")),
    ).toBeNull();
    expect(
      pickerAnnouncement(
        pickerView({ ...IDLE, recent: null, pending: "recent" }, ""),
      ),
    ).toBeNull();
  });
});

describe("itemStatus", () => {
  it("has no badge or text for an item without certificates", () => {
    expect(itemStatus(item({ quantity: 2 }))).toEqual({
      selectable: true,
      badge: null,
      text: null,
    });
  });

  it("counts the certificates of an item that has some", () => {
    expect(
      itemStatus(
        item({
          quantity: 2,
          certificates: [certificateReference(testId(1), "IS141004AG")],
        }),
      ),
    ).toEqual({
      selectable: true,
      badge: null,
      text: "1 of 2 certificates created",
    });
  });

  it("marks the item the edited certificate is linked to", () => {
    expect(
      itemStatus(
        item({
          quantity: 2,
          state: "complete",
          certificates: [certificateReference(testId(1), "IS141004AG")],
          includesThis: true,
        }),
      ),
    ).toEqual({
      selectable: true,
      badge: { label: "Selected", tone: "info" },
      text: "2 of 2 certificates created, including this one",
    });
  });

  it("says Certificate created on the edited certificate's item of quantity 1", () => {
    expect(
      itemStatus(
        item({
          state: "complete",
          certificates: [certificateReference(testId(2), "IS141004AG2")],
          includesThis: true,
        }),
      ),
    ).toEqual({
      selectable: true,
      badge: { label: "Selected", tone: "info" },
      text: "Certificate created",
    });
  });

  it("closes an item of quantity 1 that has its certificate", () => {
    expect(
      itemStatus(
        item({
          state: "complete",
          certificates: [certificateReference(testId(1), "A1B2")],
        }),
      ),
    ).toEqual({
      selectable: false,
      badge: { label: "Certificate created", tone: "success" },
      text: null,
    });
  });

  it("closes an item whose certificates are all created", () => {
    expect(
      itemStatus(
        item({
          quantity: 2,
          state: "complete",
          certificates: [
            certificateReference(testId(1), "A1B2"),
            certificateReference(testId(2), "A1B3"),
          ],
        }),
      ),
    ).toEqual({
      selectable: false,
      badge: { label: "All certificates created", tone: "success" },
      text: "2 of 2 certificates created",
    });
  });

  it("closes a refunded or removed item", () => {
    expect(itemStatus(item({ quantity: 0, state: "removed" }))).toEqual({
      selectable: false,
      badge: { label: "Refunded or removed", tone: "auto" },
      text: null,
    });
  });

  it("keeps the edited certificate's removed item selectable", () => {
    expect(
      itemStatus(item({ quantity: 0, state: "removed", includesThis: true })),
    ).toEqual({
      selectable: true,
      badge: { label: "Selected", tone: "info" },
      text: "This item is no longer in the order.",
    });
  });
});

describe("shouldAutoSkip", () => {
  it("picks the only item of an order without certificates", () => {
    const only = item();

    expect(shouldAutoSkip(detail({ lineItems: [only] }), "orders")).toBe(only);
  });

  it("shows the items when any certificate exists for the order", () => {
    const orderCertificate = {
      id: testId(1),
      code: "IS141004AG",
      signers: "Arda Güler",
      item: "Real Madrid Shirt",
      lineItemId: "gid://shopify/LineItem/1",
    };

    expect(
      shouldAutoSkip(
        detail({
          lineItems: [
            item({
              quantity: 2,
              certificates: [certificateReference(testId(1), "IS141004AG")],
            }),
          ],
          orderCertificates: [orderCertificate],
        }),
        "orders",
      ),
    ).toBeNull();
    expect(
      shouldAutoSkip(
        detail({
          legacyCertificates: [certificateReference(testId(2), "IS141002RL")],
          orderCertificates: [
            { ...orderCertificate, id: testId(2), lineItemId: null },
          ],
        }),
        "orders",
      ),
    ).toBeNull();
  });

  it("shows the items when an imported certificate may match the item", () => {
    expect(
      shouldAutoSkip(
        detail({
          lineItems: [
            item({
              possibleCertificates: [
                certificateReference(testId(2), "IS141002RL"),
              ],
            }),
          ],
        }),
        "orders",
      ),
    ).toBeNull();
  });

  it("never skips for the edited certificate's own item", () => {
    expect(
      shouldAutoSkip(
        detail({ lineItems: [item({ includesThis: true })] }),
        "orders",
      ),
    ).toBeNull();
  });

  it("shows the items when more than one can be chosen or none can", () => {
    expect(
      shouldAutoSkip(
        detail({
          lineItems: [item(), item({ id: "gid://shopify/LineItem/2" })],
        }),
        "orders",
      ),
    ).toBeNull();
    expect(
      shouldAutoSkip(
        detail({ lineItems: [item({ quantity: 0, state: "removed" })] }),
        "orders",
      ),
    ).toBeNull();
  });

  it("never skips when the picker was opened to change the item", () => {
    expect(shouldAutoSkip(detail(), "items")).toBeNull();
  });
});

describe("labels", () => {
  it("describes an order row in one sentence of facts", () => {
    expect(orderRowLabel(order("#141909"))).toBe(
      "Order #141909, 26 Sep 2026 at 14:05, Unfulfilled, 2 items, 1 certificate",
    );
    expect(orderRowLabel(order("#141909", { itemCount: 1 }))).toBe(
      "Order #141909, 26 Sep 2026 at 14:05, Unfulfilled, 1 item, 1 certificate",
    );
    expect(orderRowLabel(order("#141909", { certificateCount: 0 }))).toBe(
      "Order #141909, 26 Sep 2026 at 14:05, Unfulfilled, 2 items",
    );
    expect(
      orderRowLabel(order("#141909", { cancelled: true, certificateCount: 3 })),
    ).toBe(
      "Order #141909, 26 Sep 2026 at 14:05, Canceled, Unfulfilled, 2 items, 3 certificates",
    );
    expect(orderRowLabel(order("#141909"), true)).toBe(
      "Order #141909, 26 Sep 2026 at 14:05, Unfulfilled, 2 items, 1 certificate, selected",
    );
  });

  it("writes the visible order facts line", () => {
    expect(orderRowFacts(order("#141909"))).toBe(
      "26 Sep 2026 at 14:05 · 2 items · 1 certificate",
    );
    expect(
      orderRowFacts(order("#141909", { itemCount: 1, certificateCount: 0 })),
    ).toBe("26 Sep 2026 at 14:05 · 1 item");
  });

  it("describes an item row with its status", () => {
    expect(
      itemRowLabel(
        item({ title: "Shirt", variantTitle: "Unframed", quantity: 2 }),
      ),
    ).toBe("Shirt, Unframed, quantity 2");
    expect(
      itemRowLabel(
        item({
          title: "Shirt",
          quantity: 2,
          certificates: [certificateReference(testId(1), "A1B2")],
        }),
      ),
    ).toBe("Shirt, quantity 2, 1 of 2 certificates created");
    expect(
      itemRowLabel(
        item({
          title: "Shirt",
          variantTitle: "Framed",
          state: "complete",
          includesThis: true,
        }),
      ),
    ).toBe("Shirt, Framed, quantity 1, Certificate created, selected");
    expect(
      itemRowLabel(
        item({
          title: "Shirt",
          quantity: 0,
          state: "removed",
          includesThis: true,
        }),
      ),
    ).toBe("Shirt, quantity 0, This item is no longer in the order, selected");
  });

  it("joins the variant and a quantity above 1", () => {
    expect(variantQuantityLine("Unframed", 2)).toBe("Unframed · Quantity 2");
    expect(variantQuantityLine("Unframed", 1)).toBe("Unframed");
    expect(variantQuantityLine(null, 3)).toBe("Quantity 3");
    expect(variantQuantityLine(null, 1)).toBeNull();
  });
});
