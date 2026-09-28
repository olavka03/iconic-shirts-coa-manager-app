import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useReducer, useState, type Dispatch } from "react";
import { describe, expect, it } from "vitest";
import { todayIsoLocal } from "~/shared/utils/signing-date.utils";
import { formReducer } from "~/features/certificates/reducers/certificate-form.reducer";
import type {
  FormAction,
  FormState,
} from "~/features/certificates/types/certificate-form.types";
import { SignersSection } from "./signers-section.component";
import {
  certificateFormBuilders,
  itemRow,
  pickAction,
  signerValue,
} from "../../../../../tests/helpers/certificate-form.factory";
import {
  currentValue,
  typeInto,
} from "../../../../../tests/helpers/polaris-dom.utils";

const SHARED_LABEL = "Same date and location for all signers";

const { openForm } = certificateFormBuilders({
  values: {
    code: "IS141909THDBA",
    item: "Arsenal FC Original 2003–04 Home Shirt",
    order: { id: "gid://shopify/Order/141909", name: "#141909" },
    lineItem: { id: "gid://shopify/LineItem/1", title: "Arsenal Home Shirt" },
    signers: [],
  },
});

const HENRY = signerValue("Thierry Henry", {
  date: { precision: "DAY", iso: "2025-03-03" },
  location: "London, UK",
});
const BERGKAMP = signerValue("Dennis Bergkamp", {
  date: { precision: "DAY", iso: "2024-10-29" },
  location: "Amsterdam, Netherlands",
});

function renderSection(initial: FormState) {
  const latest: {
    state: FormState;
    dispatch: Dispatch<FormAction> | null;
    failSave: ((count: number) => void) | null;
  } = { state: initial, dispatch: null, failSave: null };
  let failures = 0;

  function Harness() {
    const [state, dispatch] = useReducer(formReducer, initial);
    const [failedSaves, setFailedSaves] = useState(0);

    latest.state = state;
    latest.dispatch = dispatch;
    latest.failSave = setFailedSaves;

    return (
      <SignersSection
        state={state}
        dispatch={dispatch}
        failedSaves={failedSaves}
      />
    );
  }

  const view = render(<Harness />);

  return {
    ...view,
    state: () => latest.state,
    dispatch: (action: FormAction) => act(() => latest.dispatch?.(action)),
    failSave: (errors: Record<string, string>) =>
      act(() => {
        failures += 1;
        latest.dispatch?.({ type: "serverErrors", errors });
        latest.failSave?.(failures);
      }),
  };
}

function fieldByLabel(tagName: string, label: string): HTMLElement {
  const match = [...document.querySelectorAll<HTMLElement>(tagName)].find(
    (element) => element.getAttribute("label") === label,
  );

  if (!match) {
    throw new Error(`No ${tagName} labelled "${label}"`);
  }

  return match;
}

function labelsOf(tagName: string): (string | null)[] {
  return [...document.querySelectorAll(tagName)].map((element) =>
    element.getAttribute("label"),
  );
}

function setProperty(element: Element, name: string, value: unknown) {
  Object.defineProperty(element, name, {
    value,
    configurable: true,
    writable: true,
  });
}

function toggle(element: Element, checked: boolean) {
  setProperty(element, "checked", checked);
  fireEvent.input(element);
}

function menuButton(signerNumber: number, text: string): HTMLElement {
  const menu = document.querySelector(
    `s-menu[accessibilityLabel="Signer ${signerNumber} actions"]`,
  )!;

  return [...menu.querySelectorAll<HTMLElement>("s-button")].find(
    (button) => button.textContent === text,
  )!;
}

function stepButton(label: "Previous signer" | "Next signer"): HTMLElement {
  return document.querySelector<HTMLElement>(
    `s-button[accessibilityLabel="${label}"]`,
  )!;
}

function chip(text: string): HTMLElement {
  return [...document.querySelectorAll<HTMLElement>("s-clickable-chip")].find(
    (element) => element.textContent === text,
  )!;
}

function counter(): string | null {
  return (
    [...document.querySelectorAll("s-text")]
      .map((element) => element.textContent)
      .find((text) => text?.startsWith("Signer ") && text.includes(" of ")) ??
    null
  );
}

function signerNames(state: FormState): string[] {
  return state.draft.signers.map((signer) => signer.name);
}

describe("SignersSection, mode 1", () => {
  it("shows one row with name, date signed, and location", () => {
    const { container } = renderSection(openForm("create"));
    const grid = container.querySelector("s-query-container > s-grid")!;
    const name = fieldByLabel("s-text-field", "Name");
    const location = fieldByLabel("s-text-field", "Location");

    expect(grid.getAttribute("gridTemplateColumns")).toBe(
      "@container (inline-size > 640px) 2fr 1.5fr 2fr, 1fr",
    );
    expect(labelsOf("s-text-field")).toEqual(["Name", "Location"]);
    expect(labelsOf("s-date-field")).toEqual(["Date signed"]);
    expect(name.id).toBe("signer-name-s0");
    expect(name.hasAttribute("required")).toBe(true);
    expect(name.getAttribute("maxLength")).toBe("120");
    expect(location.id).toBe("signer-location-s0");
    expect(location.getAttribute("placeholder")).toBe("City, country");
    expect(location.getAttribute("maxLength")).toBe("150");
    expect(
      document.querySelector("s-checkbox[label='" + SHARED_LABEL + "']"),
    ).toBeNull();
    expect(screen.getByText("Add signer")).toBeTruthy();
  });

  it("edits the signer's own values", () => {
    const { state } = renderSection(openForm("create"));

    typeInto(fieldByLabel("s-text-field", "Name"), "Thierry Henry");
    typeInto(fieldByLabel("s-text-field", "Location"), "London, UK");
    typeInto(fieldByLabel("s-date-field", "Date signed"), "2025-03-03");

    expect(state().draft.signers[0]).toMatchObject({
      name: "Thierry Henry",
      own: {
        location: "London, UK",
        date: { dayUnknown: false, iso: "2025-03-03" },
      },
    });
  });

  it("shows the signer's errors on their fields", () => {
    renderSection(
      formReducer(openForm("create"), {
        type: "serverErrors",
        errors: {
          "signers.0.name": "Enter the signer's name.",
          "signers.0.date": "Date signed can't be in the future.",
          "signers.0.location": "Use 150 characters or fewer.",
        },
      }),
    );

    expect(fieldByLabel("s-text-field", "Name").getAttribute("error")).toBe(
      "Enter the signer's name.",
    );
    expect(
      fieldByLabel("s-date-field", "Date signed").getAttribute("error"),
    ).toBe("Date signed can't be in the future.");
    expect(fieldByLabel("s-text-field", "Location").getAttribute("error")).toBe(
      "Use 150 characters or fewer.",
    );
  });
});

describe("SignersSection, adding and sharing", () => {
  it("adds a signer in mode 2 and focuses the new name", async () => {
    const { state } = renderSection(openForm("edit", { signers: [HENRY] }));

    fireEvent.click(screen.getByText("Add signer"));

    const shared = fieldByLabel("s-checkbox", SHARED_LABEL);
    const second = fieldByLabel("s-text-field", "Signer 2");

    expect(shared.hasAttribute("checked")).toBe(true);
    expect(labelsOf("s-text-field")).toEqual([
      "Location",
      "Signer 1",
      "Signer 2",
    ]);
    expect(currentValue(fieldByLabel("s-text-field", "Location"))).toBe(
      "London, UK",
    );
    expect(state().draft.sharedOn).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(second));
  });

  it("puts the shared inputs on the first signer's ids and errors", () => {
    renderSection(
      formReducer(
        openForm("edit", {
          signers: [HENRY, { ...HENRY, name: "Dennis Bergkamp" }],
        }),
        {
          type: "serverErrors",
          errors: { "signers.1.date": "Date signed can't be in the future." },
        },
      ),
    );

    const date = fieldByLabel("s-date-field", "Date signed");

    expect(date.id).toBe("signer-date-s0");
    expect(date.getAttribute("error")).toBe(
      "Date signed can't be in the future.",
    );
    expect(fieldByLabel("s-text-field", "Location").id).toBe(
      "signer-location-s0",
    );
  });

  it("restores each signer's own values when sharing is turned off", () => {
    const { state } = renderSection(
      openForm("edit", { signers: [HENRY, BERGKAMP] }),
    );

    expect(labelsOf("s-text-field")).toEqual([
      "Name",
      "Location",
      "Name",
      "Location",
    ]);
    expect(screen.getByText("Signer 1")).toBeTruthy();

    toggle(fieldByLabel("s-checkbox", SHARED_LABEL), true);

    expect(state().draft.sharedOn).toBe(true);
    expect(
      screen.getByText(
        "Saving will use signer 1's date and location for all 2 signers.",
      ),
    ).toBeTruthy();

    toggle(fieldByLabel("s-checkbox", SHARED_LABEL), false);

    const locations = [...document.querySelectorAll("s-text-field")].filter(
      (field) => field.getAttribute("label") === "Location",
    );

    expect(state().draft.sharedOn).toBe(false);
    expect(locations.map(currentValue)).toEqual([
      "London, UK",
      "Amsterdam, Netherlands",
    ]);
    expect(
      screen.queryByText(
        "Saving will use signer 1's date and location for all 2 signers.",
      ),
    ).toBeNull();
  });

  it("keeps the same checkbox when switching between modes 2 and 3", () => {
    renderSection(openForm("edit", { signers: [HENRY, BERGKAMP] }));

    const before = fieldByLabel("s-checkbox", SHARED_LABEL);

    toggle(before, true);

    expect(fieldByLabel("s-checkbox", SHARED_LABEL)).toBe(before);
  });

  it("stops at 50 signers", () => {
    const names = [...Array(50).keys()].map((index) =>
      signerValue(`Player ${index + 1}`),
    );

    renderSection(openForm("edit", { signers: names }));

    expect(screen.getByText("Add signer").hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("You can add up to 50 signers.")).toBeTruthy();
  });
});

describe("SignersSection, signer menu", () => {
  it("labels the menu and disables moves at the ends", () => {
    renderSection(openForm("edit", { signers: [HENRY, BERGKAMP] }));

    const trigger = document.querySelector(
      "s-button[accessibilityLabel='Actions for signer 1']",
    )!;

    expect(trigger.getAttribute("commandFor")).toBe("signer-menu-s0");
    expect(trigger.getAttribute("icon")).toBe("menu-horizontal");
    expect(document.querySelector("s-menu#signer-menu-s0")).not.toBeNull();
    expect(menuButton(1, "Move up").hasAttribute("disabled")).toBe(true);
    expect(menuButton(1, "Move down").hasAttribute("disabled")).toBe(false);
    expect(menuButton(2, "Move down").hasAttribute("disabled")).toBe(true);
  });

  it("moves a signer and focuses its menu button", async () => {
    const { state } = renderSection(
      openForm("edit", { signers: [HENRY, BERGKAMP] }),
    );

    fireEvent.click(menuButton(1, "Move down"));

    expect(signerNames(state())).toEqual(["Dennis Bergkamp", "Thierry Henry"]);

    const moved = document.querySelector(
      "s-button[accessibilityLabel='Actions for signer 2']",
    );

    expect(moved?.getAttribute("commandFor")).toBe("signer-menu-s0");
    await waitFor(() => expect(document.activeElement).toBe(moved));

    fireEvent.click(menuButton(2, "Move up"));

    expect(signerNames(state())).toEqual(["Thierry Henry", "Dennis Bergkamp"]);
  });

  it("removes a signer, back to mode 1, and focuses the remaining name", async () => {
    const { state } = renderSection(
      openForm("edit", { signers: [HENRY, BERGKAMP] }),
    );

    fireEvent.click(menuButton(1, "Remove signer"));

    expect(signerNames(state())).toEqual(["Dennis Bergkamp"]);
    expect(labelsOf("s-text-field")).toEqual(["Name", "Location"]);
    expect(document.querySelector("s-menu")).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(fieldByLabel("s-text-field", "Name")),
    );
  });

  it("focuses the next name after removing a signer in the middle", async () => {
    const three = [HENRY, BERGKAMP, signerValue("Robert Pires")];

    renderSection(openForm("edit", { signers: three }));
    fireEvent.click(stepButton("Next signer"));
    fireEvent.click(menuButton(2, "Remove signer"));

    await waitFor(() =>
      expect(document.activeElement?.id).toBe("signer-name-s2"),
    );
  });

  it("focuses the previous name after removing the last signer", async () => {
    const three = [HENRY, BERGKAMP, signerValue("Robert Pires")];

    renderSection(openForm("edit", { signers: three }));
    fireEvent.click(chip("Robert Pires"));
    fireEvent.click(menuButton(3, "Remove signer"));

    await waitFor(() =>
      expect(document.activeElement?.id).toBe("signer-name-s1"),
    );
  });
});

describe("SignersSection, Day unknown", () => {
  it("carries the month and year over and back", () => {
    const { state } = renderSection(openForm("edit", { signers: [HENRY] }));

    toggle(fieldByLabel("s-checkbox", "Day unknown"), true);

    const month = fieldByLabel("s-select", "Month");
    const year = fieldByLabel("s-number-field", "Year");
    const selected = month.querySelector("s-option[selected]");

    expect(month.id).toBe("signer-month-s0");
    expect(month.getAttribute("placeholder")).toBe("Select");
    expect(month.querySelectorAll("s-option")).toHaveLength(12);
    expect(selected?.textContent).toBe("March");
    expect(selected?.getAttribute("value")).toBe("03");
    expect(year.id).toBe("signer-year-s0");
    expect(currentValue(year)).toBe("2025");
    expect(year.getAttribute("inputMode")).toBe("numeric");
    expect(year.getAttribute("min")).toBe("1900");
    expect(year.getAttribute("max")).toBe(todayIsoLocal().slice(0, 4));

    typeInto(year, "2024");
    toggle(fieldByLabel("s-checkbox", "Day unknown"), false);

    const date = fieldByLabel("s-date-field", "Date signed");

    expect(state().draft.signers[0].own.date).toEqual({
      dayUnknown: false,
      iso: "",
      view: "2024-03",
    });
    expect(date.getAttribute("view")).toBe("2024-03");
    expect(date.getAttribute("allow")).toBe(`--${todayIsoLocal()}`);
  });

  it("shows the month and year errors, and a server date error on Year", () => {
    const monthOnly = formReducer(openForm("edit", { signers: [HENRY] }), {
      type: "setDate",
      target: { scope: "signer", signerKey: "s0" },
      value: { dayUnknown: true, month: "", year: "2024" },
    });
    const validated = formReducer(monthOnly, { type: "validate" });
    const { unmount } = renderSection(validated);

    expect(fieldByLabel("s-select", "Month").getAttribute("error")).toBe(
      "Choose a month.",
    );

    unmount();

    const withServerError = formReducer(
      formReducer(openForm("edit", { signers: [HENRY] }), {
        type: "setDate",
        target: { scope: "signer", signerKey: "s0" },
        value: { dayUnknown: true, month: "04", year: "2026" },
      }),
      {
        type: "serverErrors",
        errors: { "signers.0.date": "Date signed can't be in the future." },
      },
    );

    renderSection(withServerError);

    expect(fieldByLabel("s-number-field", "Year").getAttribute("error")).toBe(
      "Date signed can't be in the future.",
    );
  });
});

const MULLER_TITLE =
  "Thomas Müller Signed Bayern Munich Football Shirt - 2015-16 Home";
const pickMuller = () =>
  pickAction(
    "#141002",
    itemRow(MULLER_TITLE, { id: "gid://shopify/LineItem/2" }),
  );

describe("SignersSection, signer warning", () => {
  it("warns when the order item names someone else and offers the name", () => {
    const { container, state, dispatch } = renderSection(
      openForm("edit", { signers: [signerValue("Robert Lewandowski")] }),
    );

    expect(container.querySelector("s-banner")).toBeNull();

    dispatch(pickMuller());

    const banner = container.querySelector("s-stack > s-banner")!;

    expect(container.querySelector("s-stack")!.firstElementChild).toBe(banner);
    expect(banner.getAttribute("tone")).toBe("warning");
    expect(banner.hasAttribute("dismissible")).toBe(true);
    expect(banner.textContent).toContain(
      "The order item names Thomas Müller as the signer. This certificate lists Robert Lewandowski.",
    );

    fireEvent.click(screen.getByText("Use Thomas Müller"));

    expect(signerNames(state())).toEqual(["Thomas Müller"]);
    expect(container.querySelector("s-banner")).toBeNull();
  });

  it("hides when dismissed", () => {
    const { container, state, dispatch } = renderSection(
      openForm("edit", { signers: [signerValue("Robert Lewandowski")] }),
    );

    dispatch(pickMuller());
    act(() => {
      container.querySelector("s-banner")!.dispatchEvent(new Event("dismiss"));
    });

    expect(state().draft.signerWarningDismissed).toBe(true);
    expect(container.querySelector("s-banner")).toBeNull();
  });
});

describe("SignersSection, more than two signers", () => {
  const PIRES = signerValue("Robert Pires");
  const VIEIRA = signerValue("Patrick Vieira");
  const four = [HENRY, BERGKAMP, PIRES, VIEIRA];

  it("keeps two signers under each other", () => {
    renderSection(openForm("edit", { signers: [HENRY, BERGKAMP] }));

    expect(stepButton("Next signer")).toBeNull();
    expect(document.querySelectorAll("s-clickable-chip")).toHaveLength(0);
    expect(
      labelsOf("s-text-field").filter((label) => label === "Name"),
    ).toHaveLength(2);
  });

  it("shows one signer at a time with a counter, steps and name chips", () => {
    renderSection(openForm("edit", { signers: four }));

    expect(counter()).toBe("Signer 1 of 4");
    expect(stepButton("Previous signer").hasAttribute("disabled")).toBe(true);
    expect(stepButton("Previous signer").getAttribute("icon")).toBe(
      "chevron-left",
    );
    expect(
      document.querySelectorAll('s-text-field[label="Name"]'),
    ).toHaveLength(1);
    expect(
      [...document.querySelectorAll("s-clickable-chip")].map((element) => [
        element.textContent,
        element.getAttribute("color"),
      ]),
    ).toEqual([
      ["Thierry Henry", "strong"],
      ["Dennis Bergkamp", "base"],
      ["Robert Pires", "base"],
      ["Patrick Vieira", "base"],
    ]);

    const next = stepButton("Next signer");

    next.focus();
    fireEvent.click(next);
    fireEvent.click(next);
    fireEvent.click(next);

    expect(counter()).toBe("Signer 4 of 4");
    expect(next.hasAttribute("disabled")).toBe(true);
    expect(currentValue(fieldByLabel("s-text-field", "Name"))).toBe(
      "Patrick Vieira",
    );
    expect(chip("Patrick Vieira").getAttribute("color")).toBe("strong");
  });

  it("jumps to a signer from its chip and focuses the name", async () => {
    renderSection(openForm("edit", { signers: four }));

    fireEvent.click(chip("Robert Pires"));

    expect(counter()).toBe("Signer 3 of 4");
    await waitFor(() =>
      expect(document.activeElement).toBe(fieldByLabel("s-text-field", "Name")),
    );
  });

  it("shows a new signer, follows a moved one and stays in place after a remove", () => {
    const { state } = renderSection(openForm("edit", { signers: four }));

    fireEvent.click(menuButton(1, "Move down"));

    expect(counter()).toBe("Signer 2 of 4");
    expect(signerNames(state())[1]).toBe("Thierry Henry");

    fireEvent.click(menuButton(2, "Remove signer"));

    expect(counter()).toBe("Signer 2 of 3");
    expect(currentValue(fieldByLabel("s-text-field", "Name"))).toBe(
      "Robert Pires",
    );

    fireEvent.click(screen.getByText("Add signer"));

    expect(counter()).toBe("Signer 4 of 4");
    expect(chip("Signer 4").getAttribute("color")).toBe("strong");
  });

  it("marks signers with errors and opens the first one after a failed save", () => {
    const { failSave } = renderSection(openForm("edit", { signers: four }));

    failSave({
      "signers.3.name": "Enter the signer's name.",
      "signers.2.location": "Enter a shorter location.",
    });

    expect(counter()).toBe("Signer 3 of 4");
    expect(
      chip("Robert Pires").querySelector('s-icon[tone="critical"]'),
    ).not.toBeNull();
    expect(
      chip("Patrick Vieira").querySelector('s-icon[tone="critical"]'),
    ).not.toBeNull();
    expect(chip("Thierry Henry").querySelector("s-icon")).toBeNull();
  });

  it("keeps the shared date and location above the carousel", () => {
    renderSection(openForm("edit", { signers: four }));

    toggle(fieldByLabel("s-checkbox", SHARED_LABEL), true);

    expect(counter()).toBe("Signer 1 of 4");
    expect(labelsOf("s-text-field")).toEqual(["Location", "Signer 1"]);
  });
});
