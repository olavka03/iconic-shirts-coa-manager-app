import { act, fireEvent, render, screen } from "@testing-library/react";
import { useReducer } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ProductValue } from "~/features/certificates/types/certificates.types";
import { formReducer } from "~/features/certificates/reducers/certificate-form.reducer";
import type {
  FormAction,
  FormState,
} from "~/features/certificates/types/certificate-form.types";
import { LinkedProduct } from "./linked-product.component";
import { certificateFormBuilders } from "../../../../../tests/helpers/certificate-form.factory";

const BAYERN_PRODUCT: ProductValue = {
  id: "gid://shopify/Product/101",
  title:
    "Robert Lewandowski Signed Bayern Munich Football Shirt - 2015-16 Home",
  imageUrl: "https://cdn.shopify.com/s/files/bayern.jpg",
  status: "ACTIVE",
  missing: false,
};
const ZICO = {
  id: "gid://shopify/Product/205",
  title: "Zico Signed Brazil Football Photo - 1982 Goal",
  images: [
    {
      id: "gid://shopify/ProductImage/1",
      originalSrc: "https://cdn.shopify.com/zico.jpg",
    },
  ],
};

const { openForm } = certificateFormBuilders({
  values: { order: null, lineItem: null },
});

function renderProduct(initial: FormState) {
  const latest = { state: initial };

  function Harness() {
    const [state, dispatch] = useReducer(formReducer, initial);

    latest.state = state;

    return <LinkedProduct state={state} dispatch={dispatch} />;
  }

  const view = render(<Harness />);

  return { ...view, state: () => latest.state };
}

function pickerReturns(selection: unknown) {
  const picker = vi.mocked(shopify.resourcePicker);

  picker.mockResolvedValue(selection as Awaited<ReturnType<typeof picker>>);

  return picker;
}

async function click(text: string) {
  await act(async () => {
    fireEvent.click(screen.getByText(text));
  });
}

describe("LinkedProduct, no product", () => {
  it("offers to link a product and says what it does", () => {
    renderProduct(openForm("create"));

    const button = screen.getByText("Link product");

    expect(button.id).toBe("link-product");
    expect(button.getAttribute("icon")).toBe("product");
    expect(button.getAttribute("variant")).toBe("tertiary");
    expect(
      screen.getByText(
        "Optional. Fills in the item name from a product in your store.",
      ),
    ).toBeTruthy();
  });

  it("opens the picker searching for the item text", async () => {
    const picker = pickerReturns(undefined);
    const state = formReducer(openForm("create"), {
      type: "setItem",
      value: "  Arsenal home shirt ",
    });

    renderProduct(state);
    await click("Link product");

    expect(picker).toHaveBeenCalledWith({
      type: "product",
      action: "select",
      multiple: false,
      filter: { variants: false },
      query: "Arsenal home shirt",
    });
  });

  it("opens the picker without a search when Item is empty", async () => {
    const picker = pickerReturns(undefined);

    renderProduct(openForm("create"));
    await click("Link product");

    expect(picker.mock.calls[0][0]).toEqual(
      expect.objectContaining({ query: undefined }),
    );
  });

  it("changes nothing when the picker is closed", async () => {
    pickerReturns(undefined);

    const { state } = renderProduct(openForm("create"));

    await click("Link product");

    expect(state().draft.product).toBeNull();
    expect(screen.getByText("Link product")).toBeTruthy();
  });

  it("links the picked product and fills an empty Item from its title", async () => {
    pickerReturns([ZICO]);

    const { state } = renderProduct(openForm("create"));

    await click("Link product");

    expect(state().draft.product).toEqual({
      id: ZICO.id,
      title: ZICO.title,
      imageUrl: "https://cdn.shopify.com/zico.jpg",
      status: null,
      missing: false,
    });
    expect(state().draft.item).toBe("Brazil Football Photo - 1982 Goal");
    expect(screen.getByText(ZICO.title)).toBeTruthy();
  });

  it("never overwrites a typed Item", async () => {
    pickerReturns([{ ...ZICO, images: [] }]);

    const typed = formReducer(openForm("create"), {
      type: "setItem",
      value: "Match-worn Brazil photo",
    });
    const { state } = renderProduct(typed);

    await click("Link product");

    expect(state().draft.item).toBe("Match-worn Brazil photo");
    expect(state().draft.product?.imageUrl).toBeNull();
  });

  it("logs a picker failure and changes nothing", async () => {
    const failure = new Error("Picker unavailable");
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    vi.mocked(shopify.resourcePicker).mockRejectedValue(failure);

    const { state } = renderProduct(openForm("create"));

    await click("Link product");

    expect(consoleError).toHaveBeenCalledWith(failure);
    expect(state().draft.product).toBeNull();
  });
});

describe("LinkedProduct, linked", () => {
  it("shows the product and preselects it when changing", async () => {
    const picker = pickerReturns(undefined);
    const { container } = renderProduct(
      openForm("edit", { product: BAYERN_PRODUCT }),
    );
    const thumbnail = container.querySelector("s-thumbnail")!;

    expect(thumbnail.getAttribute("src")).toBe(BAYERN_PRODUCT.imageUrl);
    expect(thumbnail.getAttribute("alt")).toBe(BAYERN_PRODUCT.title);
    expect(thumbnail.getAttribute("size")).toBe("small");
    expect(screen.getByText(BAYERN_PRODUCT.title)).toBeTruthy();
    expect(container.querySelector("s-badge")).toBeNull();
    expect(screen.queryByText("Link product")).toBeNull();

    await click("Change");

    expect(picker).toHaveBeenCalledWith({
      type: "product",
      action: "select",
      multiple: false,
      filter: { variants: false },
      selectionIds: [{ id: BAYERN_PRODUCT.id }],
    });
  });

  it.each([
    ["DRAFT", "Draft", "info"],
    ["ARCHIVED", "Archived", null],
    ["UNLISTED", "Unlisted", null],
  ] as const)("marks a %s product", (status, label, tone) => {
    const { container } = renderProduct(
      openForm("edit", { product: { ...BAYERN_PRODUCT, status } }),
    );
    const badge = container.querySelector("s-badge")!;

    expect(badge.textContent).toBe(label);
    expect(badge.getAttribute("tone")).toBe(tone);
  });

  it("removes the product without touching Item", () => {
    const { state } = renderProduct(
      openForm("edit", { product: BAYERN_PRODUCT }),
    );

    fireEvent.click(screen.getByText("Remove"));

    expect(state().draft.product).toBeNull();
    expect(state().draft.item).toBe(
      "Bayern Munich Football Shirt - 2015-16 Home",
    );
    expect(screen.getByText("Link product")).toBeTruthy();
  });

  it("offers only Remove for a product deleted in Shopify", () => {
    const { container } = renderProduct(
      openForm("edit", {
        product: { ...BAYERN_PRODUCT, imageUrl: null, missing: true },
      }),
    );
    const buttons = [...container.querySelectorAll("s-button")].map(
      (button) => button.textContent,
    );

    expect(
      screen.getByText("This product is no longer in your store."),
    ).toBeTruthy();
    expect(screen.getByText(BAYERN_PRODUCT.title)).toBeTruthy();
    expect(container.querySelector("s-thumbnail")!.hasAttribute("src")).toBe(
      false,
    );
    expect(buttons).toEqual(["Remove"]);
  });
});

describe("LinkedProduct, dispatch", () => {
  it("sends linkProduct with the picked image", async () => {
    pickerReturns([ZICO]);

    const dispatch = vi.fn<(action: FormAction) => void>();

    render(<LinkedProduct state={openForm("create")} dispatch={dispatch} />);
    await click("Link product");

    expect(dispatch).toHaveBeenCalledWith({
      type: "linkProduct",
      product: {
        id: ZICO.id,
        title: ZICO.title,
        imageUrl: "https://cdn.shopify.com/zico.jpg",
        status: null,
      },
    });
  });
});
