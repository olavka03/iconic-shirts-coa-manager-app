import { act, fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestJson } from "~/shared/utils/json-request.utils";
import type {
  OrderDetail,
  OrderDetailResponse,
  OrderItemRow,
  OrderRow,
  OrdersListResponse,
} from "~/features/orders/types/orders.types";
import type { PickerOpen } from "~/features/orders/types/order-picker.types";
import { OrderPicker, type OrderPickerHandle } from "./order-picker.component";
import { deferred } from "../../../../tests/helpers/fetch-stub.utils";
import { testId } from "../../../../tests/helpers/test-ids.utils";

vi.mock("~/shared/utils/json-request.utils", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("~/shared/utils/json-request.utils")
  >()),
  requestJson: vi.fn(),
}));

function order(name: string, overrides: Partial<OrderRow> = {}): OrderRow {
  const numericId = `500000${name.replace(/\D/g, "").slice(-4)}`;

  return {
    id: `gid://shopify/Order/${numericId}`,
    numericId,
    name,
    createdLabel: "26 Sep 2026 at 14:05",
    fulfillment: { label: "Unfulfilled", tone: "caution" },
    cancelled: false,
    itemCount: 1,
    itemSummary: "Bayern Munich Football Shirt - 2015-16 Home",
    certificateCount: 0,
    ...overrides,
  };
}

function item(id: string, overrides: Partial<OrderItemRow> = {}): OrderItemRow {
  return {
    id: `gid://shopify/LineItem/${id}`,
    title: `Item ${id}`,
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

const RECENT = [
  order("#141005"),
  order("#141004", { itemCount: 5, certificateCount: 3 }),
  order("#141003"),
  order("#141002"),
];
const CLEAN = detailOf(RECENT[2], [item("31")]);
const BUSY = detailOf(
  RECENT[1],
  [
    item("41", {
      title: "Arda Güler Signed Real Madrid Shirt",
      variantTitle: "Unframed",
      quantity: 2,
      certificates: [{ id: testId(7), code: "IS141004AG" }],
    }),
    item("42", {
      title: "Thierry Henry Signed Arsenal Home Shirt",
      state: "complete",
      certificates: [{ id: testId(8), code: "IS141004TH" }],
    }),
    item("43", {
      title: "Paul Scholes Signed Manchester United Shirt",
      quantity: 0,
      state: "removed",
    }),
    item("44", {
      title: "Robert Lewandowski Signed Bayern Munich Shirt",
      possibleCertificates: [{ id: testId(9), code: "IS141004RL" }],
    }),
  ],
  {
    legacyCertificates: [
      { id: testId(10), code: "IS141004X" },
      { id: testId(11), code: "IS141004Y" },
    ],
  },
);

function detailOf(
  row: OrderRow,
  lineItems: OrderItemRow[],
  overrides: Partial<OrderDetail> = {},
): OrderDetail {
  return {
    order: row,
    lineItems,
    legacyCertificates: [],
    orderCertificates: [],
    takenCodes: [],
    ...overrides,
  };
}

const list = (orders: OrderRow[], more = false): OrdersListResponse => ({
  ok: true,
  orders,
  more,
});
const found = (detail: OrderDetail | null): OrderDetailResponse => ({
  ok: true,
  detail,
});

type Handler = (url: string, signal?: AbortSignal) => unknown;

function serve(handler: Handler) {
  vi.mocked(requestJson).mockImplementation(((
    url: string,
    requestInit?: { signal?: AbortSignal },
  ) =>
    Promise.resolve(handler(url, requestInit?.signal))) as typeof requestJson);
}

function byUrl(routes: Record<string, unknown>): Handler {
  return (url) => {
    if (!(url in routes)) {
      throw new Error(`Unexpected request ${url}`);
    }

    return routes[url];
  };
}

const urls = () => vi.mocked(requestJson).mock.calls.map(([url]) => url);

type MountOptions = {
  strict?: boolean;
  prefetch?: boolean;
  excludeId?: string | null;
  currentOrderId?: string | null;
};

function mount(options: MountOptions = {}) {
  const handleRef = createRef<OrderPickerHandle>();
  const onPick = vi.fn();
  const onNavigate = vi.fn();
  const view = render(
    <OrderPicker
      ref={handleRef}
      excludeId={options.excludeId ?? null}
      currentOrderId={options.currentOrderId ?? null}
      prefetch={options.prefetch ?? true}
      onPick={onPick}
      onNavigate={onNavigate}
    />,
    { reactStrictMode: options.strict ?? false },
  );
  const modal = view.container.querySelector("s-modal")!;
  const hideOverlay = vi.fn();

  modal.hideOverlay = hideOverlay;

  const first = <QueriedElement extends Element = HTMLElement>(
    selector: string,
  ) => view.container.querySelector<QueriedElement & HTMLElement>(selector);
  const all = (selector: string) => [
    ...view.container.querySelectorAll<HTMLElement>(selector),
  ];
  const text = () => view.container.textContent ?? "";
  const field = () => first("s-search-field")!;
  // React sets a property when the element has one and an attribute otherwise.
  const fieldValue = () =>
    (field() as HTMLElement & { value?: string }).value ??
    field().getAttribute("value");
  const orderNames = () =>
    all("s-clickable").map(
      (row) => row.querySelector('s-text[type="strong"]')?.textContent,
    );
  const button = (label: string) =>
    all("s-button").find((candidate) => candidate.textContent === label) ??
    null;
  const live = () => first('[aria-live="polite"]')?.textContent;

  return {
    ...view,
    handleRef,
    onPick,
    onNavigate,
    modal,
    hideOverlay,
    first,
    all,
    text,
    field,
    fieldValue,
    orderNames,
    button,
    live,
  };
}

type Picker = ReturnType<typeof mount>;

async function flush() {
  await act(async () => {});
}

async function openPicker(
  picker: Picker,
  open: PickerOpen = { step: "orders" },
) {
  await act(async () => {
    picker.handleRef.current!.prepare(open);
  });
  await act(async () => {
    picker.modal.dispatchEvent(new Event("aftershow"));
  });
}

async function type(picker: Picker, value: string) {
  await act(async () => {
    const field = picker.field() as HTMLElement & { value: string };

    field.value = value;
    fireEvent.input(field);
  });
}

async function pressEnter(picker: Picker) {
  await act(async () => {
    fireEvent.keyDown(picker.field(), { key: "Enter" });
  });
}

async function click(element: Element | null) {
  expect(element).not.toBeNull();
  await act(async () => {
    fireEvent.click(element!);
  });
}

const rowOf = (picker: Picker, name: string) =>
  picker
    .all("s-clickable")
    .find(
      (row) => row.querySelector('s-text[type="strong"]')?.textContent === name,
    ) ?? null;

beforeEach(() => {
  vi.mocked(requestJson).mockReset();
});

describe("OrderPicker, step 1", () => {
  it("prefetches the recent orders on mount and shows them at once", async () => {
    serve(byUrl({ "/api/orders": list(RECENT) }));
    const picker = mount({ prefetch: true });

    await flush();
    expect(urls()).toEqual(["/api/orders"]);

    await openPicker(picker);

    expect(picker.modal.getAttribute("heading")).toBe("Select order");
    expect(picker.modal.getAttribute("padding")).toBe("none");
    expect(
      picker.first('s-spinner[accessibilityLabel="Loading orders"]'),
    ).toBeNull();
    expect(picker.text()).toContain("Recent orders");
    expect(picker.orderNames()).toEqual([
      "#141005",
      "#141004",
      "#141003",
      "#141002",
    ]);
    expect(rowOf(picker, "#141004")?.getAttribute("accessibilityLabel")).toBe(
      "Order #141004, 26 Sep 2026 at 14:05, Unfulfilled, 5 items, 3 certificates",
    );
    expect(rowOf(picker, "#141004")?.textContent).toContain(
      "26 Sep 2026 at 14:05 · 5 items · 3 certificates",
    );
    expect(picker.live()).toBe("Recent orders");
    expect(picker.field().getAttribute("label")).toBe("Search orders");
    expect(picker.field().getAttribute("placeholder")).toBe(
      "Search by order number",
    );
    expect(picker.field().getAttribute("autocomplete")).toBe("off");
  });

  it("finishes the prefetch under StrictMode", async () => {
    serve(byUrl({ "/api/orders": list(RECENT) }));
    const picker = mount({ strict: true, prefetch: true });

    await flush();
    await openPicker(picker);

    expect(
      picker.first('s-spinner[accessibilityLabel="Loading orders"]'),
    ).toBeNull();
    expect(picker.orderNames()).toHaveLength(4);
  });

  it("refreshes the prefetched list in the background on the first open", async () => {
    serve(byUrl({ "/api/orders": list(RECENT) }));
    const picker = mount({ prefetch: true });

    await flush();
    await openPicker(picker);

    expect(urls()).toEqual(["/api/orders", "/api/orders"]);
    expect(picker.orderNames()).toHaveLength(4);
  });

  it("keeps the rows without a banner when the background refresh fails", async () => {
    const replies: unknown[] = [list(RECENT), { ok: false, kind: "network" }];

    serve(() => replies.shift());
    const picker = mount({ prefetch: true });

    await flush();
    await openPicker(picker);

    expect(urls()).toEqual(["/api/orders", "/api/orders"]);
    expect(picker.orderNames()).toHaveLength(4);
    expect(picker.first("s-banner")).toBeNull();
    expect(picker.text()).toContain("Recent orders");
  });

  it("loads the list on the first open when it wasn't prefetched", async () => {
    const reply = deferred();

    serve(() => reply.promise);
    const picker = mount({ prefetch: false });

    await flush();
    expect(urls()).toEqual([]);

    await openPicker(picker);

    expect(urls()).toEqual(["/api/orders"]);
    expect(
      picker
        .first('s-spinner[accessibilityLabel="Loading orders"]')
        ?.getAttribute("size"),
    ).toBe("large");

    await act(async () => {
      reply.resolve(list(RECENT));
    });

    expect(
      picker.first('s-spinner[accessibilityLabel="Loading orders"]'),
    ).toBeNull();
    expect(picker.orderNames()).toHaveLength(4);
  });

  it("focuses the search field when the modal has opened", async () => {
    serve(byUrl({ "/api/orders": list(RECENT) }));
    const picker = mount();

    await flush();

    const focus = vi.spyOn(picker.field(), "focus");

    await openPicker(picker);

    expect(focus).toHaveBeenCalled();
  });

  it("marks the current order as selected", async () => {
    serve(byUrl({ "/api/orders": list(RECENT) }));
    const picker = mount({ currentOrderId: RECENT[1].id });

    await openPicker(picker);

    const row = rowOf(picker, "#141004");

    expect(row?.textContent).toContain("Selected");
    expect(row?.getAttribute("accessibilityLabel")).toMatch(/, selected$/);
    expect(rowOf(picker, "#141005")?.textContent).not.toContain("Selected");
  });

  it("filters the recent rows at once and searches once per pause", async () => {
    vi.useFakeTimers();
    const searches: { url: string; signal?: AbortSignal }[] = [];

    serve((url, signal) => {
      if (url === "/api/orders") {
        return list(RECENT);
      }

      searches.push({ url, signal });

      return new Promise(() => {});
    });
    const picker = mount();

    await openPicker(picker);
    await type(picker, "1");
    await type(picker, "14100");
    await type(picker, "141003");

    expect(picker.orderNames()).toEqual(["#141003"]);
    expect(searches).toEqual([]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(299);
    });
    expect(searches).toEqual([]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(searches.map((search) => search.url)).toEqual([
      "/api/orders?q=141003",
    ]);
    expect(
      picker.first('s-spinner[accessibilityLabel="Searching orders"]'),
    ).not.toBeNull();
    expect(picker.orderNames()).toEqual(["#141003"]);

    await type(picker, "14100");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(searches.map((search) => search.url)).toEqual([
      "/api/orders?q=141003",
      "/api/orders?q=14100",
    ]);
    expect(searches[0].signal?.aborted).toBe(true);
    expect(searches[1].signal?.aborted).toBe(false);
    expect(picker.orderNames()).toHaveLength(4);
  });

  it("brings the recent list back at once when the field is cleared", async () => {
    vi.useFakeTimers();
    serve((url) => (url === "/api/orders" ? list(RECENT) : list([])));
    const picker = mount();

    await openPicker(picker);
    await type(picker, "999");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(picker.text()).toContain("No orders found");

    await type(picker, "");

    expect(picker.orderNames()).toHaveLength(4);
    expect(picker.text()).toContain("Recent orders");
    expect(
      urls().filter((url) => url.startsWith("/api/orders?q=")),
    ).toHaveLength(1);
  });

  it("counts the results for the current text", async () => {
    serve(
      byUrl({
        "/api/orders": list(RECENT),
        "/api/orders?q=1419": list([
          order("#141909"),
          order("#141908"),
          order("#141907"),
        ]),
      }),
    );
    const picker = mount();

    await openPicker(picker);
    await type(picker, "1419");
    await pressEnter(picker);

    expect(picker.text()).toContain("3 orders");
    expect(picker.orderNames()).toEqual(["#141909", "#141908", "#141907"]);
    expect(picker.live()).toBe("3 orders");
  });

  it("keeps the matching recent rows when the server finds nothing", async () => {
    serve(
      byUrl({ "/api/orders": list(RECENT), "/api/orders?q=14100": list([]) }),
    );
    const picker = mount();

    await openPicker(picker);
    await type(picker, "14100");
    await pressEnter(picker);

    expect(picker.orderNames()).toHaveLength(4);
    expect(picker.text()).toContain("Recent orders");
    expect(picker.text()).toContain(
      "Enter the full order number to search all orders.",
    );
  });

  it("searches at once on Enter and then opens the single exact match", async () => {
    serve(
      byUrl({
        "/api/orders": list(RECENT),
        "/api/orders?q=141003": list([order("#141003"), order("#1410030")]),
        "/api/orders?id=5000001003": found(
          detailOf(RECENT[2], [item("31"), item("32")]),
        ),
      }),
    );
    const picker = mount();

    await openPicker(picker);
    await type(picker, "#141003");
    await pressEnter(picker);

    expect(urls()).toContain("/api/orders?q=141003");
    expect(urls()).not.toContain("/api/orders?id=5000001003");

    await pressEnter(picker);

    expect(urls().at(-1)).toBe("/api/orders?id=5000001003");
    expect(picker.modal.getAttribute("heading")).toBe("Select item");
  });

  it("says nothing was found and gives the newest order as the example", async () => {
    serve(
      byUrl({ "/api/orders": list(RECENT), "/api/orders?q=999999": list([]) }),
    );
    const picker = mount();

    await openPicker(picker);
    await type(picker, "999999");
    await pressEnter(picker);

    expect(picker.first('s-icon[type="search"]')).not.toBeNull();
    expect(picker.text()).toContain("No orders found");
    expect(picker.text()).toContain(
      "Check the number and enter it in full, for example #141005. Orders placed more than 60 days ago can't be selected.",
    );
    expect(picker.orderNames()).toEqual([]);
    expect(picker.live()).toBe("No orders found");
  });

  it("says there are no orders in the last 60 days", async () => {
    serve(byUrl({ "/api/orders": list([]) }));
    const picker = mount();

    await openPicker(picker);

    expect(picker.first('s-icon[type="order"]')).not.toBeNull();
    expect(picker.text()).toContain("No orders in the last 60 days");
    expect(picker.text()).toContain(
      "Orders placed more than 60 days ago can't be selected.",
    );
  });

  it("repeats the failed request with Try again", async () => {
    const replies: unknown[] = [{ ok: false, kind: "network" }, list(RECENT)];

    serve(() => replies.shift());
    const picker = mount({ prefetch: false });

    await openPicker(picker);

    const banner = picker.first('s-banner[tone="critical"]');

    expect(banner?.getAttribute("heading")).toBe("Orders couldn't be loaded");
    expect(banner?.textContent).toContain(
      "Check your connection and try again.",
    );

    await click(picker.button("Try again"));

    expect(urls()).toEqual(["/api/orders", "/api/orders"]);
    expect(picker.first("s-banner")).toBeNull();
    expect(picker.orderNames()).toHaveLength(4);
  });

  it("repeats a failed search with Try again", async () => {
    const replies: unknown[] = [
      { ok: false, formError: "unavailable" },
      list([order("#141909")]),
    ];

    serve((url) => (url === "/api/orders" ? list(RECENT) : replies.shift()));
    const picker = mount();

    await openPicker(picker);
    await type(picker, "141909");
    await pressEnter(picker);

    expect(
      picker.first('s-banner[heading="Orders couldn\'t be loaded"]'),
    ).not.toBeNull();

    await click(picker.button("Try again"));

    expect(urls().filter((url) => url === "/api/orders?q=141909")).toHaveLength(
      2,
    );
    expect(picker.orderNames()).toEqual(["#141909"]);
  });

  it("shows the search results after the recent list failed to load", async () => {
    serve(
      byUrl({
        "/api/orders": { ok: false, kind: "network" },
        "/api/orders?q=141909": list([order("#141909")]),
      }),
    );
    const picker = mount({ prefetch: false });

    await openPicker(picker);

    expect(picker.button("Try again")).not.toBeNull();

    await type(picker, "141909");
    await pressEnter(picker);

    expect(urls()).toEqual(["/api/orders", "/api/orders?q=141909"]);
    expect(
      picker.first('s-spinner[accessibilityLabel="Loading orders"]'),
    ).toBeNull();
    expect(picker.first("s-banner")).toBeNull();
    expect(picker.text()).toContain("1 order");
    expect(picker.orderNames()).toEqual(["#141909"]);
  });

  it("says nothing was found after the recent list failed and the search is empty", async () => {
    serve(
      byUrl({
        "/api/orders": { ok: false, kind: "network" },
        "/api/orders?q=999999": list([]),
      }),
    );
    const picker = mount({ prefetch: false });

    await openPicker(picker);
    await type(picker, "999999");
    await pressEnter(picker);

    expect(
      picker.first('s-spinner[accessibilityLabel="Loading orders"]'),
    ).toBeNull();
    expect(picker.text()).toContain("No orders found");
    expect(picker.text()).toContain(
      "Check the number and enter it in full. Orders placed more than 60 days ago can't be selected.",
    );
  });

  it("keeps the load failure while the text can't be searched", async () => {
    const replies: unknown[] = [{ ok: false, kind: "network" }, list(RECENT)];

    serve(() => replies.shift());
    const picker = mount({ prefetch: false });

    await openPicker(picker);
    await type(picker, "#");

    expect(urls()).toEqual(["/api/orders"]);
    expect(
      picker.first('s-spinner[accessibilityLabel="Loading orders"]'),
    ).toBeNull();
    expect(
      picker.first('s-banner[heading="Orders couldn\'t be loaded"]'),
    ).not.toBeNull();

    await click(picker.button("Try again"));

    expect(urls()).toEqual(["/api/orders", "/api/orders"]);
    expect(picker.first("s-banner")).toBeNull();
    expect(picker.orderNames()).toHaveLength(4);
    expect(picker.text()).toContain(
      "Enter the full order number to search all orders.",
    );
  });

  it("repeats both failed requests with one Try again", async () => {
    const listReplies: unknown[] = [
      { ok: false, kind: "network" },
      list(RECENT),
    ];
    const searchReplies: unknown[] = [
      { ok: false, kind: "network" },
      list([order("#141909")]),
    ];

    serve((url) =>
      url === "/api/orders" ? listReplies.shift() : searchReplies.shift(),
    );
    const picker = mount({ prefetch: false });

    await openPicker(picker);
    await type(picker, "141909");
    await pressEnter(picker);

    expect(
      picker.first('s-banner[heading="Orders couldn\'t be loaded"]'),
    ).not.toBeNull();

    await click(picker.button("Try again"));

    expect(urls()).toEqual([
      "/api/orders",
      "/api/orders?q=141909",
      "/api/orders",
      "/api/orders?q=141909",
    ]);
    expect(picker.first("s-banner")).toBeNull();
    expect(picker.orderNames()).toEqual(["#141909"]);
  });

  it("shows the Link order results when the recent list fails", async () => {
    serve(
      byUrl({
        "/api/orders": { ok: false, kind: "network" },
        "/api/orders?q=141909": list([order("#141909")]),
      }),
    );
    const picker = mount({ prefetch: false });

    await openPicker(picker, { step: "orders", query: "141909" });

    expect(picker.fieldValue()).toBe("141909");
    expect(picker.first("s-banner")).toBeNull();
    expect(picker.text()).toContain("1 order");
    expect(picker.orderNames()).toEqual(["#141909"]);
  });

  it("waits for the recent list before saying a Link order search found nothing", async () => {
    const recentReply = deferred();

    serve((url) => (url === "/api/orders" ? recentReply.promise : list([])));
    const picker = mount({ prefetch: false });

    await openPicker(picker, { step: "orders", query: "141909" });

    expect(
      picker.first('s-spinner[accessibilityLabel="Loading orders"]'),
    ).not.toBeNull();
    expect(picker.text()).not.toContain("No orders found");

    await act(async () => {
      recentReply.resolve(list(RECENT));
    });

    expect(picker.text()).toContain(
      "Check the number and enter it in full, for example #141005.",
    );
  });

  it("explains that the app has no access to orders", async () => {
    serve(byUrl({ "/api/orders": { ok: false, formError: "orders_access" } }));
    const picker = mount();

    await openPicker(picker);

    const banner = picker.first("s-banner");

    expect(banner?.getAttribute("tone")).toBe("critical");
    expect(banner?.getAttribute("heading")).toBe("Orders aren't available");
    expect(banner?.textContent).toBe(
      "This app doesn't have access to your store's orders. Contact your app developer.",
    );
    expect(picker.button("Try again")).toBeNull();
  });

  it("explains a search refused for lack of access to orders", async () => {
    serve(
      byUrl({
        "/api/orders": list(RECENT),
        "/api/orders?q=141909": { ok: false, formError: "orders_access" },
      }),
    );
    const picker = mount();

    await openPicker(picker);
    await type(picker, "141909");
    await pressEnter(picker);

    expect(picker.first("s-banner")?.getAttribute("heading")).toBe(
      "Orders aren't available",
    );
    expect(picker.button("Try again")).toBeNull();
    expect(picker.orderNames()).toEqual([]);
  });

  it("shows which row is opening", async () => {
    const reply = deferred();

    serve((url) => (url === "/api/orders" ? list(RECENT) : reply.promise));
    const picker = mount({ excludeId: testId(12) });

    await openPicker(picker);
    await click(rowOf(picker, "#141004"));

    const row = rowOf(picker, "#141004");

    expect(urls().at(-1)).toBe(
      `/api/orders?id=5000001004&exclude=${testId(12)}`,
    );
    expect(row?.hasAttribute("loading")).toBe(true);
    expect(
      row?.querySelector(
        's-spinner[accessibilityLabel="Loading order #141004"]',
      ),
    ).not.toBeNull();
    expect(rowOf(picker, "#141005")?.hasAttribute("loading")).toBe(false);
    expect(picker.live()).toBe("Loading order #141004");
  });

  it("drops the first order's answer when another row is opened", async () => {
    const replies = new Map([
      ["/api/orders?id=5000001003", deferred<OrderDetailResponse>()],
      ["/api/orders?id=5000001004", deferred<OrderDetailResponse>()],
    ]);
    const signals = new Map<string, AbortSignal | undefined>();

    serve((url, signal) => {
      signals.set(url, signal);

      return url === "/api/orders" ? list(RECENT) : replies.get(url)!.promise;
    });
    const picker = mount();

    await openPicker(picker);
    await click(rowOf(picker, "#141003"));
    await click(rowOf(picker, "#141004"));

    expect(signals.get("/api/orders?id=5000001003")?.aborted).toBe(true);
    expect(signals.get("/api/orders?id=5000001004")?.aborted).toBe(false);

    await act(async () => {
      replies.get("/api/orders?id=5000001003")!.resolve(found(CLEAN));
    });

    expect(picker.onPick).not.toHaveBeenCalled();
    expect(rowOf(picker, "#141004")?.hasAttribute("loading")).toBe(true);

    await act(async () => {
      replies.get("/api/orders?id=5000001004")!.resolve(found(BUSY));
    });

    expect(picker.onPick).not.toHaveBeenCalled();
    expect(picker.hideOverlay).not.toHaveBeenCalled();
    expect(picker.modal.getAttribute("heading")).toBe("Select item");
    expect(picker.text()).toContain("Arda Güler Signed Real Madrid Shirt");
  });

  it("keeps step 1 with a banner when the order couldn't be loaded", async () => {
    serve((url) =>
      url === "/api/orders" ? list(RECENT) : { ok: false, kind: "network" },
    );
    const picker = mount();

    await openPicker(picker);
    await click(rowOf(picker, "#141004"));

    expect(picker.modal.getAttribute("heading")).toBe("Select order");
    expect(
      picker.first('s-banner[heading="Orders couldn\'t be loaded"]'),
    ).not.toBeNull();
    expect(picker.orderNames()).toHaveLength(4);

    await click(picker.button("Try again"));

    expect(
      urls().filter((url) => url.startsWith("/api/orders?id=")),
    ).toHaveLength(2);
  });

  it("picks the only item of a clean order and closes", async () => {
    serve(
      byUrl({
        "/api/orders": list(RECENT),
        "/api/orders?id=5000001003": found(CLEAN),
      }),
    );
    const picker = mount();

    await openPicker(picker);
    await click(rowOf(picker, "#141003"));

    expect(picker.onPick).toHaveBeenCalledWith({
      order: CLEAN.order,
      item: CLEAN.lineItems[0],
      detail: CLEAN,
    });
    expect(picker.hideOverlay).toHaveBeenCalledTimes(1);
  });
});

describe("OrderPicker, step 2", () => {
  async function openBusy(picker: Picker) {
    await openPicker(picker);
    await click(rowOf(picker, "#141004"));
  }

  const busyRoutes = {
    "/api/orders": list(RECENT),
    "/api/orders?id=5000001004": found(BUSY),
  };

  it("lists the items with their badges and statuses", async () => {
    serve(byUrl(busyRoutes));
    const picker = mount();

    await openBusy(picker);

    expect(picker.onPick).not.toHaveBeenCalled();
    expect(picker.modal.getAttribute("heading")).toBe("Select item");
    expect(picker.text()).toContain("#141004");
    expect(picker.live()).toBe("Select item. Order #141004, 4 items.");

    const [guler, lewandowski] = picker.all("s-clickable");

    expect(picker.all("s-clickable")).toHaveLength(2);
    expect(guler.getAttribute("accessibilityLabel")).toBe(
      "Arda Güler Signed Real Madrid Shirt, Unframed, quantity 2, 1 of 2 certificates created",
    );
    expect(guler.textContent).toContain("Unframed · Quantity 2");
    expect(guler.textContent).toContain("1 of 2 certificates created");
    expect(lewandowski.getAttribute("accessibilityLabel")).toBe(
      "Robert Lewandowski Signed Bayern Munich Shirt, quantity 1",
    );
    expect(picker.all("s-badge").map((badge) => badge.textContent)).toEqual([
      "Unfulfilled",
      "Certificate created",
      "Refunded or removed",
    ]);
  });

  it("focuses the first item that can be chosen", async () => {
    serve(byUrl(busyRoutes));
    const picker = mount();
    const focus = vi.spyOn(HTMLElement.prototype, "focus");

    await openBusy(picker);

    expect(focus.mock.contexts.at(-1)).toBe(picker.all("s-clickable")[0]);
  });

  it("shows full and removed items as plain boxes with their certificate links", async () => {
    serve(byUrl(busyRoutes));
    const picker = mount();

    await openBusy(picker);

    const texts = picker
      .all("s-text")
      .map((textElement) => textElement.textContent ?? "");
    const henry = picker
      .all("s-box")
      .find((box) => box.textContent?.startsWith("Thierry Henry"));

    expect(henry?.closest("s-clickable")).toBeNull();
    expect(
      picker
        .all("s-clickable")
        .some((row) => row.textContent?.includes("Paul Scholes")),
    ).toBe(false);
    expect(
      texts.find((text) => text === "Thierry Henry Signed Arsenal Home Shirt"),
    ).toBeDefined();
    expect(
      picker
        .all("s-text")
        .find(
          (textElement) =>
            textElement.textContent ===
            "Thierry Henry Signed Arsenal Home Shirt",
        )
        ?.getAttribute("color"),
    ).toBe("subdued");
    expect(texts).toContain("Certificate: IS141004TH");
    expect(texts).toContain("Certificate: IS141004AG");
    expect(picker.all("s-link").map((link) => link.textContent)).toEqual([
      "IS141004X",
      "IS141004Y",
      "IS141004AG",
      "IS141004TH",
      "IS141004RL",
    ]);
    expect(
      picker
        .all("s-link")
        .every((link) => link.closest("s-clickable") === null),
    ).toBe(true);
  });

  it("hints at imported certificates and warns about unmatched ones", async () => {
    serve(byUrl(busyRoutes));
    const picker = mount();

    await openBusy(picker);

    expect(
      picker.all("s-text").map((textElement) => textElement.textContent),
    ).toContain("May already have a certificate: IS141004RL");

    const warning = picker.first('s-banner[tone="warning"]');

    expect(warning?.textContent).toBe(
      "This order has certificates that aren't linked to an item: IS141004X and IS141004Y. Check them before you create another one.",
    );
  });

  it("picks a selectable item and closes", async () => {
    serve(byUrl(busyRoutes));
    const picker = mount();

    await openBusy(picker);
    await click(picker.all("s-clickable")[1]);

    expect(picker.onPick).toHaveBeenCalledWith({
      order: BUSY.order,
      item: BUSY.lineItems[3],
      detail: BUSY,
    });
    expect(picker.hideOverlay).toHaveBeenCalledTimes(1);
  });

  it("closes a certificate link first, then navigates", async () => {
    serve(byUrl(busyRoutes));
    const picker = mount();

    await openBusy(picker);
    await click(
      picker.all("s-link").find((link) => link.textContent === "IS141004TH")!,
    );

    expect(picker.hideOverlay).toHaveBeenCalledTimes(1);
    expect(picker.onNavigate).toHaveBeenCalledWith(
      `/app/certificates/${testId(8)}`,
    );
    expect(picker.hideOverlay.mock.invocationCallOrder[0]).toBeLessThan(
      picker.onNavigate.mock.invocationCallOrder[0],
    );
    expect(picker.onPick).not.toHaveBeenCalled();
  });

  it("explains an order that can't be selected, without Try again", async () => {
    serve(
      byUrl({
        "/api/orders": list(RECENT),
        "/api/orders?id=5000001004": found(null),
      }),
    );
    const picker = mount();

    await openBusy(picker);

    const banner = picker.first('s-banner[tone="info"]');

    expect(picker.text()).toContain("#141004");
    expect(banner?.getAttribute("heading")).toBe(
      "This order can't be selected",
    );
    expect(banner?.textContent).toBe(
      "Orders placed more than 60 days ago, or deleted orders, can't be selected.",
    );
    expect(picker.button("Try again")).toBeNull();
  });

  it("goes back to the same query and results", async () => {
    serve(
      byUrl({
        ...busyRoutes,
        "/api/orders?q=14100": list([RECENT[1], RECENT[2]]),
      }),
    );
    const picker = mount();

    await openPicker(picker);
    await type(picker, "14100");
    await pressEnter(picker);
    await click(rowOf(picker, "#141004"));

    expect(picker.modal.getAttribute("heading")).toBe("Select item");

    const focus = vi.spyOn(HTMLElement.prototype, "focus");

    await click(picker.button("Back to orders"));

    expect(picker.modal.getAttribute("heading")).toBe("Select order");
    expect(picker.fieldValue()).toBe("14100");
    expect(picker.orderNames()).toEqual(["#141004", "#141003"]);
    expect(picker.text()).toContain("2 orders");
    expect(focus.mock.contexts.at(-1)).toBe(picker.field());
  });

  it("changes nothing on Cancel and starts from step 1 next time", async () => {
    serve(byUrl(busyRoutes));
    const picker = mount();

    await openBusy(picker);

    const cancel = picker.button("Cancel");

    expect(cancel?.getAttribute("commandFor")).toBe("order-picker");
    expect(cancel?.getAttribute("command")).toBe("--hide");
    expect(cancel?.getAttribute("slot")).toBe("secondary-actions");

    await click(cancel);
    await act(async () => {
      picker.modal.dispatchEvent(new Event("afterhide"));
    });

    expect(picker.onPick).not.toHaveBeenCalled();
    expect(picker.hideOverlay).not.toHaveBeenCalled();
    expect(picker.modal.getAttribute("heading")).toBe("Select order");
    expect(picker.orderNames()).toHaveLength(4);
  });
});

describe("OrderPicker, opened to change the item", () => {
  const OPEN: PickerOpen = {
    step: "items",
    order: {
      numericId: "5000001003",
      name: "#141003",
      fulfillment: { label: "Unfulfilled", tone: "caution" },
      createdLabel: "26 Sep 2026 at 14:05",
    },
  };

  it("loads the saved order's items without skipping ahead", async () => {
    const reply = deferred();

    serve((url) => (url === "/api/orders" ? list(RECENT) : reply.promise));
    const picker = mount({ prefetch: false, excludeId: testId(12) });

    await openPicker(picker, OPEN);

    expect(picker.modal.getAttribute("heading")).toBe("Select item");
    expect(urls()).toContain(`/api/orders?id=5000001003&exclude=${testId(12)}`);
    expect(picker.text()).toContain("#141003");
    expect(
      picker.first('s-spinner[accessibilityLabel="Loading items"]'),
    ).not.toBeNull();

    await act(async () => {
      reply.resolve(found(CLEAN));
    });

    expect(picker.onPick).not.toHaveBeenCalled();
    expect(picker.all("s-clickable")).toHaveLength(1);
  });

  it("closes without a pick on the row of this certificate", async () => {
    const own = detailOf(RECENT[2], [
      item("31", { state: "complete", includesThis: true }),
      item("32"),
    ]);

    serve(
      byUrl({
        "/api/orders": list(RECENT),
        [`/api/orders?id=5000001003&exclude=${testId(12)}`]: found(own),
      }),
    );
    const picker = mount({ excludeId: testId(12) });

    await openPicker(picker, OPEN);

    const [selected] = picker.all("s-clickable");

    expect(selected.textContent).toContain("Selected");
    expect(selected.textContent).toContain("Certificate created");
    expect(selected.textContent).not.toContain("including this one");

    await click(selected);

    expect(picker.onPick).not.toHaveBeenCalled();
    expect(picker.hideOverlay).toHaveBeenCalledTimes(1);
  });

  it("offers Try again when the order couldn't be loaded", async () => {
    const replies: unknown[] = [{ ok: false, kind: "network" }, found(CLEAN)];

    serve((url) => (url === "/api/orders" ? list(RECENT) : replies.shift()));
    const picker = mount();

    await openPicker(picker, OPEN);

    expect(
      picker.first('s-banner[heading="This order couldn\'t be loaded"]')
        ?.textContent,
    ).toContain("Check your connection and try again.");

    await click(picker.button("Try again"));

    expect(picker.all("s-clickable")).toHaveLength(1);
    expect(picker.onPick).not.toHaveBeenCalled();
  });

  it("shows the access banner when orders aren't available", async () => {
    serve((url) =>
      url === "/api/orders"
        ? list(RECENT)
        : { ok: false, formError: "orders_access" },
    );
    const picker = mount();

    await openPicker(picker, OPEN);

    expect(picker.first("s-banner")?.getAttribute("heading")).toBe(
      "Orders aren't available",
    );
  });

  it("focuses Back to orders when no item can be chosen", async () => {
    serve(
      byUrl({
        "/api/orders": list(RECENT),
        "/api/orders?id=5000001003": found(
          detailOf(RECENT[2], [item("31", { quantity: 0, state: "removed" })]),
        ),
      }),
    );
    const picker = mount();
    const focus = vi.spyOn(HTMLElement.prototype, "focus");

    await openPicker(picker, OPEN);

    expect(focus.mock.contexts.at(-1)).toBe(picker.button("Back to orders"));
  });
});
