import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrderCard } from "~/features/orders/types/orders.types";
import type { PickerOpen } from "~/features/orders/types/order-picker.types";
import type { OrderSectionProps } from "~/features/orders/types/order-section.types";
import { orderSectionState } from "~/features/orders/utils/order-section-state.utils";
import { OrderSection } from "./order-section.component";

const ORDER = { id: "gid://shopify/Order/5000001909", name: "#141909" };
const LINE_ITEM = {
  id: "gid://shopify/LineItem/60001909",
  title:
    "Robert Lewandowski Signed Bayern Munich Football Shirt - 2015-16 Home",
};
const CARD: OrderCard = {
  createdLabel: "26 Sep 2026 at 14:05",
  fulfillment: { label: "Unfulfilled", tone: "caution" },
  cancelled: false,
  selectableItems: 2,
  lineItem: {
    variantTitle: "Unframed",
    quantity: 2,
    imageUrl: "https://cdn.shopify.com/li.jpg",
  },
};

function propsWith(
  overrides: Partial<OrderSectionProps> = {},
): OrderSectionProps {
  return {
    kind: "create",
    order: null,
    lineItem: null,
    orderCard: null,
    productImageUrl: null,
    orderError: null,
    lineItemError: null,
    filledLine: null,
    onOpenPicker: vi.fn(),
    ...overrides,
  };
}

const selectedProps = (overrides: Partial<OrderSectionProps> = {}) =>
  propsWith({
    order: ORDER,
    lineItem: LINE_ITEM,
    orderCard: CARD,
    ...overrides,
  });

function show(props: OrderSectionProps) {
  const view = render(<OrderSection {...props} />);
  const text = () => view.container.textContent ?? "";
  const button = (id: string) =>
    view.container.querySelector<HTMLElement>(`s-button#${id}`);

  return { ...view, text, button };
}

const commandListeners = new Set<() => void>();

afterEach(() => {
  commandListeners.forEach((listener) =>
    document.removeEventListener("click", listener),
  );
  commandListeners.clear();
});

// Stands in for the Polaris command, which runs after the click reaches the document.
function recordCallsWhenCommandRuns(onOpenPicker: ReturnType<typeof vi.fn>) {
  const seen: number[] = [];
  const listener = () => seen.push(onOpenPicker.mock.calls.length);

  document.addEventListener("click", listener);
  commandListeners.add(listener);

  return seen;
}

function expectOpener(
  element: HTMLElement | null,
  onOpenPicker: ReturnType<typeof vi.fn>,
  open: PickerOpen,
) {
  expect(element).not.toBeNull();
  expect(element?.getAttribute("commandFor")).toBe("order-picker");
  expect(element?.getAttribute("command")).toBe("--show");

  const seen = recordCallsWhenCommandRuns(onOpenPicker);

  fireEvent.click(element!);

  expect(onOpenPicker).toHaveBeenCalledWith(open);
  expect(seen).toEqual([1]);
}

describe("orderSectionState", () => {
  it("maps the draft to the section states", () => {
    expect(orderSectionState(propsWith())).toBe("O1");
    expect(
      orderSectionState(propsWith({ orderError: "Select an order." })),
    ).toBe("O2");
    expect(orderSectionState(selectedProps())).toBe("O3");
    expect(
      orderSectionState(
        selectedProps({ orderCard: { ...CARD, lineItem: null } }),
      ),
    ).toBe("O3b");
    expect(orderSectionState(selectedProps({ orderCard: null }))).toBe("O4");
    expect(
      orderSectionState(
        selectedProps({
          lineItemError:
            "All certificates for this item are already created. Select another item.",
        }),
      ),
    ).toBe("O5");
    expect(
      orderSectionState(
        propsWith({ kind: "edit", order: { id: null, name: "#141909" } }),
      ),
    ).toBe("O6");
    expect(
      orderSectionState(
        propsWith({ kind: "edit", order: { id: null, name: null } }),
      ),
    ).toBe("O7");
    expect(orderSectionState(propsWith({ kind: "edit" }))).toBe("O7");
  });
});

describe("OrderSection", () => {
  it("O1 asks for an order with the primary Select order button", () => {
    const props = propsWith();
    const { container, text, button } = show(props);

    expect(container.querySelector("s-section")?.getAttribute("heading")).toBe(
      "Order",
    );
    expect(text()).toContain(
      "Select the order and the item this certificate is for. The item name, signer, and code are filled in from the order.",
    );

    const select = button("select-order");

    expect(select?.getAttribute("variant")).toBe("primary");
    expect(select?.getAttribute("icon")).toBe("order");
    expect(select?.textContent).toBe("Select order");
    expect(text()).not.toContain("Select an order.");
    expectOpener(select, vi.mocked(props.onOpenPicker), { step: "orders" });
  });

  it("O2 adds the critical line", () => {
    const { container, text } = show(
      propsWith({ orderError: "Select an order." }),
    );

    expect(text()).toContain("Select an order.");
    expect(
      container
        .querySelector('s-icon[type="alert-circle"]')
        ?.getAttribute("tone"),
    ).toBe("critical");
    expect(
      container.querySelector('s-text[tone="critical"]')?.textContent,
    ).toBe("Select an order.");
  });

  it("O3 shows the live order card", () => {
    const props = selectedProps();
    const { container, text, button } = show(props);
    const badge = container.querySelector("s-badge");

    expect(text()).toContain("#141909");
    expect(badge?.textContent).toBe("Unfulfilled");
    expect(badge?.getAttribute("tone")).toBe("caution");
    expect(text()).toContain("26 Sep 2026 at 14:05");
    expect(text()).toContain(LINE_ITEM.title);
    expect(text()).toContain("Unframed · Quantity 2");
    expect(container.querySelector("s-thumbnail")?.getAttribute("src")).toBe(
      "https://cdn.shopify.com/li.jpg",
    );
    expect(button("change-order")?.getAttribute("accessibilityLabel")).toBe(
      "Change order",
    );
    expect(button("change-item")?.getAttribute("accessibilityLabel")).toBe(
      "Change item",
    );
    expectOpener(button("change-order"), vi.mocked(props.onOpenPicker), {
      step: "orders",
    });
  });

  it("O3 opens the items of the current order for Change item", () => {
    const props = selectedProps();
    const { button } = show(props);

    expectOpener(button("change-item"), vi.mocked(props.onOpenPicker), {
      step: "items",
      order: {
        numericId: "5000001909",
        name: "#141909",
        fulfillment: { label: "Unfulfilled", tone: "caution" },
        createdLabel: "26 Sep 2026 at 14:05",
      },
    });
  });

  it("O3 offers Change item only when the order has another item to choose", () => {
    const { container, button, text } = show(
      selectedProps({
        orderCard: {
          ...CARD,
          selectableItems: 1,
          lineItem: { variantTitle: null, quantity: 1, imageUrl: null },
        },
        productImageUrl: "https://cdn.shopify.com/product.jpg",
      }),
    );

    expect(button("change-item")).toBeNull();
    expect(text()).not.toContain("Quantity");
    expect(container.querySelector("s-thumbnail")?.getAttribute("src")).toBe(
      "https://cdn.shopify.com/product.jpg",
    );
  });

  it("marks a cancelled order", () => {
    const { container } = show(
      selectedProps({ orderCard: { ...CARD, cancelled: true } }),
    );

    expect(
      [...container.querySelectorAll("s-badge")].map(
        (badge) => badge.textContent,
      ),
    ).toEqual(["Canceled", "Unfulfilled"]);
  });

  it("O3b says the item is gone and offers Change item", () => {
    const { text, button } = show(
      selectedProps({
        orderCard: { ...CARD, selectableItems: 1, lineItem: null },
      }),
    );

    expect(text()).toContain(LINE_ITEM.title);
    expect(text()).toContain("This item is no longer in the order.");
    expect(text()).not.toContain("Quantity");
    expect(button("change-item")).not.toBeNull();
  });

  it("O3b has no Change item when nothing else can be chosen", () => {
    const { button } = show(
      selectedProps({
        orderCard: { ...CARD, selectableItems: 0, lineItem: null },
      }),
    );

    expect(button("change-item")).toBeNull();
  });

  it("O4 shows the saved order without badges or Change item", () => {
    const { container, text, button } = show(
      selectedProps({
        kind: "edit",
        orderCard: null,
        productImageUrl: "https://cdn.shopify.com/product.jpg",
      }),
    );

    expect(text()).toContain("#141909");
    expect(text()).toContain(LINE_ITEM.title);
    expect(container.querySelector("s-badge")).toBeNull();
    expect(text()).not.toContain("26 Sep 2026");
    expect(button("change-order")).not.toBeNull();
    expect(button("change-item")).toBeNull();
    expect(container.querySelector("s-thumbnail")?.getAttribute("src")).toBe(
      "https://cdn.shopify.com/product.jpg",
    );
  });

  it("O5 shows the item error and Change item", () => {
    const message = "This item is no longer in the order. Select another item.";
    const { container, button } = show(
      selectedProps({
        orderCard: { ...CARD, selectableItems: 1 },
        lineItemError: message,
      }),
    );

    expect(
      container.querySelector('s-text[tone="critical"]')?.textContent,
    ).toBe(message);
    expect(button("change-item")).not.toBeNull();
  });

  it("O6 shows the stored name and Link order with the order number", () => {
    const props = propsWith({
      kind: "edit",
      order: { id: null, name: "#141909" },
    });
    const { text, button } = show(props);
    const link = button("select-order");

    expect(text()).toContain("#141909");
    expect(text()).toContain("Not linked to an order in Shopify");
    expect(link?.textContent).toBe("Link order");
    expect(link?.getAttribute("icon")).toBe("link");
    expect(link?.getAttribute("variant")).toBe("tertiary");
    expectOpener(link, vi.mocked(props.onOpenPicker), {
      step: "orders",
      query: "141909",
    });
  });

  it("O7 shows no name and opens an empty search", () => {
    const props = propsWith({ kind: "edit" });
    const { container, text, button } = show(props);

    expect(text()).toContain("Not linked to an order in Shopify");
    expect(container.querySelector('s-text[type="strong"]')).toBeNull();
    expectOpener(button("select-order"), vi.mocked(props.onOpenPicker), {
      step: "orders",
    });
  });

  it("shows the Filled in line after a pick", () => {
    const line =
      "Filled in from the order: item name, linked product, signer, and certificate code.";
    const { text } = show(selectedProps({ filledLine: line }));

    expect(text()).toContain(line);
  });

  it("hands the openers to the form for focus", () => {
    const selectOrderRef = { current: null as HTMLElement | null };
    const changeOrderRef = { current: null as HTMLElement | null };

    show(propsWith({ selectOrderRef }));
    expect(selectOrderRef.current?.id).toBe("select-order");

    show(selectedProps({ changeOrderRef }));
    expect(changeOrderRef.current?.id).toBe("change-order");
  });
});
