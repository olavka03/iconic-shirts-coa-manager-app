import { act, fireEvent, render, screen } from "@testing-library/react";
import { useReducer, type Dispatch } from "react";
import { describe, expect, it, vi } from "vitest";
import type { CodeHistoryItem } from "~/features/codes/types/code-generator.types";
import { buildTeamDictionary } from "~/features/codes/utils/team-dictionary.utils";
import type { OrderCertificateReference } from "~/features/orders/types/orders.types";
import type { CodeCheck } from "~/features/codes/hooks/use-code-check.hook";
import { formReducer } from "~/features/certificates/reducers/certificate-form.reducer";
import type {
  FormAction,
  FormKind,
  FormState,
} from "~/features/certificates/types/certificate-form.types";
import { CertificateSection } from "./certificate-section.component";
import { CodeField } from "./code-field.component";
import { OrderCertificates } from "~/features/orders/components/order-certificates.component";
import {
  certificateFormBuilders,
  itemRow,
  pickAction,
} from "../../../../../tests/helpers/certificate-form.factory";
import {
  currentValue,
  typeInto,
} from "../../../../../tests/helpers/polaris-dom.utils";
import { testId } from "../../../../../tests/helpers/test-ids.utils";

const HISTORY: CodeHistoryItem[] = [
  {
    code: "IS141638RLBM",
    item: "Bayern Munich Football Shirt - 2015-16 Home",
    signerNames: ["Robert Lewandowski"],
    orderName: "#141638",
  },
  {
    code: "IS141638RLBD",
    item: "Borussia Dortmund Football Shirt - 2011-12 Home",
    signerNames: ["Robert Lewandowski"],
    orderName: "#141638",
  },
];
const DICTIONARY = buildTeamDictionary(HISTORY);
const BAYERN_TITLE =
  "Robert Lewandowski Signed Bayern Munich Football Shirt - 2015-16 Home";
const BAYERN_ITEM = "Bayern Munich Football Shirt - 2015-16 Home";
const DORTMUND_TITLE =
  "Robert Lewandowski Signed Original Borussia Dortmund Football Shirt - 2011-12 Home";
const MANUAL_DETAILS = "Customers enter this code on your verification page.";
const IDLE_CHECK: CodeCheck = {
  status: "idle",
  usedBy: null,
  checkNow: () => {},
};
const TAKEN_CHECK: CodeCheck = {
  status: "taken",
  usedBy: { id: testId(7), signers: "Robert Lewandowski", item: BAYERN_ITEM },
  checkNow: () => {},
};

const { openForm } = certificateFormBuilders({ dictionary: DICTIONARY });

function run(state: FormState, ...actions: FormAction[]): FormState {
  return actions.reduce(formReducer, state);
}

const pickedCreate = () =>
  run(openForm("create"), pickAction("#141002", itemRow(BAYERN_TITLE)));

function renderField(
  initial: FormState,
  { codeCheck = IDLE_CHECK, onNavigate = vi.fn() } = {},
) {
  const latest: { state: FormState; dispatch: Dispatch<FormAction> | null } = {
    state: initial,
    dispatch: null,
  };

  function Harness() {
    const [state, dispatch] = useReducer(formReducer, initial);

    latest.state = state;
    latest.dispatch = dispatch;

    return (
      <CodeField
        state={state}
        dispatch={dispatch}
        codeCheck={codeCheck}
        onNavigate={onNavigate}
      />
    );
  }

  const view = render(<Harness />);
  const field = () => view.container.querySelector("s-text-field")!;

  return {
    ...view,
    field,
    onNavigate,
    state: () => latest.state,
    dispatch: (action: FormAction) => act(() => latest.dispatch?.(action)),
  };
}

describe("CodeField", () => {
  it("renders the code field with its fixed attributes", () => {
    const { field } = renderField(openForm("create"));

    expect(field().id).toBe("certificate-code");
    expect(field().getAttribute("label")).toBe("Certificate code");
    expect(field().hasAttribute("required")).toBe(true);
    expect(field().getAttribute("autocomplete")).toBe("off");
    expect(field().getAttribute("maxLength")).toBe("32");
  });

  it("explains the code in every state", () => {
    const detailsOf = (state: FormState) => {
      const { field, unmount } = renderField(state);
      // On edit the details go under the field and the copy button, as their own text.
      const details =
        field().getAttribute("details") ??
        field()
          .closest("s-grid")
          ?.parentElement?.querySelector(":scope > s-text")?.textContent ??
        null;

      unmount();

      return details;
    };

    expect(detailsOf(openForm("create"))).toBe(
      "A code is suggested when you select an order.",
    );
    expect(
      detailsOf(
        run(openForm("create"), pickAction("#141002", itemRow(BAYERN_ITEM))),
      ),
    ).toBe("Add who signed it to complete the code.");
    expect(
      detailsOf(
        run(pickedCreate(), { type: "codeTaken", code: "IS141002RLBM1516" }),
      ),
    ).toBe("IS141002RLBM1516 is already used, so -2 was added.");
    expect(
      detailsOf(
        run(
          openForm("create"),
          pickAction(
            "#141002",
            itemRow("Zico Signed Brazil Football Photo - 1982 Goal"),
          ),
        ),
      ),
    ).toBe("Check the letters after the order number before saving.");
    expect(detailsOf(pickedCreate())).toBe(
      "Suggested from the order number, signer initials, team, and season.",
    );
    expect(
      detailsOf(run(pickedCreate(), { type: "setCode", value: "IS141002RL" })),
    ).toBe(MANUAL_DETAILS);
    expect(detailsOf(openForm("edit"))).toBe(MANUAL_DETAILS);
  });

  it("upper-cases and removes spaces while typing", () => {
    const { field, state } = renderField(openForm("create"));

    typeInto(field(), "is141002 x");

    expect(currentValue(field())).toBe("IS141002X");
    expect(state().codeMode).toBe("manual");
  });

  it("offers the suggestion on create in manual mode and applies it", () => {
    const { field, state } = renderField(pickedCreate());

    expect(screen.queryByText("Use suggested code")).toBeNull();

    typeInto(field(), "IS141002RL");

    expect(screen.getByText("Suggested: IS141002RLBM1516")).toBeTruthy();

    fireEvent.click(screen.getByText("Use suggested code"));

    expect(currentValue(field())).toBe("IS141002RLBM1516");
    expect(state().codeMode).toBe("auto");
    expect(screen.queryByText("Use suggested code")).toBeNull();
  });

  it("offers a suggestion on edit only after a pick in this draft", () => {
    const { field, dispatch } = renderField(openForm("edit"));

    expect(screen.queryByText(/Suggested:/)).toBeNull();

    dispatch(pickAction("#141002", itemRow(DORTMUND_TITLE)));

    expect(screen.getByText("Suggested: IS141002RLBD1112")).toBeTruthy();
    expect(currentValue(field())).toBe("IS141002RLBM1516");

    fireEvent.click(screen.getByText("Use suggested code"));

    expect(currentValue(field())).toBe("IS141002RLBD1112");
  });

  it("shows a manual conflict with a link to the other certificate", () => {
    const { field, onNavigate } = renderField(
      run(pickedCreate(), { type: "setCode", value: "IS141002RLBM1516" }),
      { codeCheck: TAKEN_CHECK },
    );
    const link = screen.getByText("View certificate");

    expect(field().getAttribute("error")).toBe(
      "This code is already used for Robert Lewandowski, Bayern Munich Football Shirt - 2015-16 Home.",
    );
    expect(link.getAttribute("href")).toBe(`/app/certificates/${testId(7)}`);

    const click = new MouseEvent("click", { bubbles: true, cancelable: true });

    link.dispatchEvent(click);

    expect(onNavigate).toHaveBeenCalledWith(`/app/certificates/${testId(7)}`);
    expect(click.defaultPrevented).toBe(true);
  });

  it("leaves a modified click on the link to the browser", () => {
    const { onNavigate } = renderField(
      run(pickedCreate(), { type: "setCode", value: "IS141002RLBM1516" }),
      { codeCheck: TAKEN_CHECK },
    );

    fireEvent.click(screen.getByText("View certificate"), { metaKey: true });

    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("never shows a conflict in auto mode", () => {
    const { field } = renderField(pickedCreate(), { codeCheck: TAKEN_CHECK });

    expect(field().hasAttribute("error")).toBe(false);
    expect(screen.queryByText("View certificate")).toBeNull();
  });

  it("prefers the error from a save attempt over the live conflict", () => {
    const { field } = renderField(
      run(
        pickedCreate(),
        { type: "setCode", value: "IS141002RLBM1516" },
        { type: "serverErrors", errors: { code: "Use only letters." } },
      ),
      { codeCheck: TAKEN_CHECK },
    );

    expect(field().getAttribute("error")).toBe("Use only letters.");
  });

  it("shows format errors on blur and clears them once the code is valid", () => {
    const checkNow = vi.fn();
    const { field } = renderField(openForm("create"), {
      codeCheck: { ...IDLE_CHECK, checkNow },
    });

    typeInto(field(), "IS1");

    expect(field().hasAttribute("error")).toBe(false);

    fireEvent.blur(field());

    expect(field().getAttribute("error")).toBe(
      "Use between 4 and 32 characters.",
    );
    expect(checkNow).toHaveBeenCalledTimes(1);

    typeInto(field(), "IS14");

    expect(field().hasAttribute("error")).toBe(false);
  });

  it.each<FormKind>(["edit", "create"])(
    "waits for the next blur after leaving a valid or empty code on %s",
    (kind) => {
      const { field } = renderField(openForm(kind));

      fireEvent.blur(field());

      expect(field().hasAttribute("error")).toBe(false);

      typeInto(field(), "I");

      expect(field().hasAttribute("error")).toBe(false);

      fireEvent.blur(field());

      expect(field().getAttribute("error")).toBe(
        "Use between 4 and 32 characters.",
      );
    },
  );

  it("doesn't ask for a code on blur and returns an emptied field to auto mode", () => {
    const { field, state } = renderField(
      run(pickedCreate(), { type: "setCode", value: "IS141002RL" }),
    );

    typeInto(field(), "");
    fireEvent.blur(field());

    expect(field().hasAttribute("error")).toBe(false);
    expect(state().codeMode).toBe("auto");
    expect(currentValue(field())).toBe("IS141002RLBM1516");
  });

  it("waits for a save attempt before asking for a missing code on edit", () => {
    const { field } = renderField(openForm("edit"));

    typeInto(field(), "");
    fireEvent.blur(field());

    expect(currentValue(field())).toBe("");
    expect(field().hasAttribute("error")).toBe(false);
  });

  it("warns before a saved code changes and restores it", () => {
    const { field } = renderField(openForm("edit"));

    expect(screen.queryByText("Use old code")).toBeNull();

    typeInto(field(), "IS141002RLBM1516X");

    const banner = document.querySelector("s-banner")!;

    expect(banner.getAttribute("tone")).toBe("warning");
    expect(banner.textContent).toContain(
      "Customers who have the old code, IS141002RLBM1516, won't be able to verify it after you save.",
    );

    fireEvent.click(screen.getByText("Use old code"));

    expect(currentValue(field())).toBe("IS141002RLBM1516");
    expect(document.querySelector("s-banner")).toBeNull();
  });

  it("copies the saved code on edit", async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    const { field } = renderField(openForm("edit"));

    typeInto(field(), "IS141002RLBM1516X");

    const copy = copyButton()!;

    const row = copy.parentElement!;

    expect(copy.hasAttribute("slot")).toBe(false);
    expect(row.tagName).toBe("S-GRID");
    expect(row.getAttribute("gridTemplateColumns")).toBe("1fr auto");
    expect(row.getAttribute("alignItems")).toBe("end");
    expect(row.firstElementChild).toBe(field());
    expect(copy.getAttribute("variant")).toBe("tertiary");
    expect(copy.getAttribute("icon")).toBe("clipboard");
    expect(copy.textContent).toBe("");
    expect(copy.getAttribute("interestFor")).toBe("copy-code-tip");
    expect(document.getElementById("copy-code-tip")?.textContent).toBe(
      "Copy code",
    );

    await act(async () => {
      fireEvent.click(copy);
    });

    expect(writeText).toHaveBeenCalledWith("IS141002RLBM1516");
    expect(shopify.toast.show).toHaveBeenCalledWith("Code copied");
  });

  it("shows Copied with a check for 2 seconds, with the details under the field", async () => {
    vi.useFakeTimers();
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    const { field } = renderField(openForm("edit"));
    const copy = copyButton()!;
    const details = copy.parentElement!.nextElementSibling!.nextElementSibling!;

    expect(field().hasAttribute("details")).toBe(false);
    expect(details.textContent).toBe(
      "Customers enter this code on your verification page.",
    );

    await act(async () => {
      fireEvent.click(copy);
    });

    expect(copy.getAttribute("icon")).toBe("check");
    expect(copy.getAttribute("accessibilityLabel")).toBe("Copied");
    expect(document.getElementById("copy-code-tip")?.textContent).toBe(
      "Copied",
    );
    expect(shopify.toast.show).toHaveBeenCalledWith("Code copied");

    act(() => vi.advanceTimersByTime(1999));

    expect(copy.getAttribute("icon")).toBe("check");

    act(() => vi.advanceTimersByTime(1));

    expect(copy.getAttribute("icon")).toBe("clipboard");
    expect(copy.getAttribute("accessibilityLabel")).toBe("Copy code");
  });

  it("selects the code when the clipboard refuses", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new DOMException("Denied", "NotAllowedError"),
    );
    const { field } = renderField(openForm("edit"));
    const input = document.createElement("input");

    field().attachShadow({ mode: "open" }).append(input);

    const select = vi.spyOn(input, "select");

    await act(async () => {
      fireEvent.click(copyButton()!);
    });

    expect(shopify.toast.show).toHaveBeenCalledWith("Couldn't copy the code", {
      isError: true,
    });
    expect(select).toHaveBeenCalled();
    expect(copyButton()).not.toBeNull();
  });

  it("offers Copy code only on edit and only with a clipboard", () => {
    const created = renderField(openForm("create"));

    expect(copyButton()).toBeNull();

    created.unmount();
    vi.spyOn(navigator, "clipboard", "get").mockReturnValue(
      undefined as unknown as Clipboard,
    );
    renderField(openForm("edit"));

    expect(copyButton()).toBeNull();
  });
});

function copyButton(): HTMLElement | null {
  return document.querySelector('s-button[accessibilityLabel="Copy code"]');
}

function certificateReference(
  sequence: number,
  overrides: Partial<OrderCertificateReference> = {},
): OrderCertificateReference {
  return {
    id: testId(sequence),
    code: `IS141002RL${sequence}`,
    signers: "Robert Lewandowski",
    item: BAYERN_ITEM,
    lineItemId: null,
    ...overrides,
  };
}

describe("OrderCertificates", () => {
  it("renders nothing when the order has no other certificates", () => {
    const { container } = render(
      <OrderCertificates
        certificates={[]}
        orderName="#141002"
        onNavigate={vi.fn()}
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("lists the other certificates with in-app links", () => {
    const onNavigate = vi.fn();
    const { container } = render(
      <OrderCertificates
        certificates={[
          certificateReference(3, {
            item: "Bayern Munich Football Shirt - 2015-16 Home, signed on the front below the club badge",
          }),
          certificateReference(4, { signers: "", item: "" }),
        ]}
        orderName="#141002"
        onNavigate={onNavigate}
      />,
    );
    const items = [...container.querySelectorAll("s-list-item")];

    expect(screen.getByText("Other certificates for this order")).toBeTruthy();
    expect(items.map((item) => item.textContent)).toEqual([
      "IS141002RL3 · Robert Lewandowski · Bayern Munich Football Shirt - 2015-16 Home, signed on the…",
      "IS141002RL4",
    ]);

    fireEvent.click(screen.getByText("IS141002RL4"));

    expect(onNavigate).toHaveBeenCalledWith(`/app/certificates/${testId(4)}`);
    expect(screen.queryByText(/View all/)).toBeNull();
  });

  it("shows five and links to the rest by order number", () => {
    const onNavigate = vi.fn();
    const certificateReferences = [1, 2, 3, 4, 5, 6, 7].map((id) =>
      certificateReference(id),
    );
    const { container } = render(
      <OrderCertificates
        certificates={certificateReferences}
        orderName="#141002"
        onNavigate={onNavigate}
      />,
    );
    const viewAll = screen.getByText("View all 7");

    expect(container.querySelectorAll("s-list-item")).toHaveLength(5);
    expect(viewAll.getAttribute("href")).toBe("/app?q=141002");

    fireEvent.click(viewAll);

    expect(onNavigate).toHaveBeenCalledWith("/app?q=141002");
  });
});

describe("CertificateSection", () => {
  function renderSection(
    initial: FormState,
    duplicateOf: { code: string } | null = null,
  ) {
    function Harness() {
      const [state, dispatch] = useReducer(formReducer, initial);

      return (
        <CertificateSection
          state={state}
          dispatch={dispatch}
          codeCheck={IDLE_CHECK}
          onNavigate={vi.fn()}
          duplicateOf={duplicateOf}
        />
      );
    }

    return render(<Harness />);
  }

  it("holds the code, the order's other certificates, the item and the product", () => {
    const { container } = renderSection(
      run(
        openForm("create"),
        pickAction("#141002", itemRow(BAYERN_TITLE), {
          orderCertificates: [certificateReference(3)],
        }),
      ),
    );
    const section = container.querySelector("s-section")!;
    const item = container.querySelector("s-text-field#certificate-item")!;

    expect(section.getAttribute("heading")).toBe("Certificate");
    expect(section.hasAttribute("subheading")).toBe(false);
    expect(container.querySelector("#certificate-code")).not.toBeNull();
    expect(screen.getByText("Other certificates for this order")).toBeTruthy();
    expect(item.getAttribute("label")).toBe("Item");
    expect(item.hasAttribute("required")).toBe(true);
    expect(item.getAttribute("maxLength")).toBe("200");
    expect(currentValue(item)).toBe(BAYERN_ITEM);
    expect(screen.getByText("Link product")).toBeTruthy();

    typeInto(item, "Match-prepared home shirt");

    expect(currentValue(item)).toBe("Match-prepared home shirt");
  });

  it("names the source on duplicate and shows the item error", () => {
    const { container } = renderSection(
      run(openForm("create"), { type: "validate" }),
      { code: "IS141816PMM" },
    );

    expect(
      container.querySelector("s-section")!.getAttribute("subheading"),
    ).toBe("Copied from IS141816PMM");
    expect(
      container
        .querySelector("s-text-field#certificate-item")!
        .getAttribute("error"),
    ).toBe("Enter the item name.");
  });
});
