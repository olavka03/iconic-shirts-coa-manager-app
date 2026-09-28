import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CodeHistoryItem } from "~/features/codes/types/code-generator.types";
import { withSeriesHint } from "~/features/codes/utils/code-suggestion.utils";
import { buildTeamDictionary } from "~/features/codes/utils/team-dictionary.utils";
import type {
  CertificateDetail,
  CertificateFormValues,
} from "~/features/certificates/types/certificates.types";
import type { OrderItemRow } from "~/features/orders/types/orders.types";
import type {
  DateAndLocationTarget,
  DateDraft,
  FormAction,
  FormState,
} from "~/features/certificates/types/certificate-form.types";
import {
  emptyDraft,
  sharedOverridesOthers,
  signerMode,
} from "~/features/certificates/utils/certificate-form-draft.utils";
import { clientErrors } from "~/features/certificates/utils/certificate-form-errors.utils";
import {
  isDirty,
  projection,
  toInput,
} from "~/features/certificates/utils/certificate-form-input.utils";
import {
  codeDetails,
  codeSuggestion,
  filledLine,
  signerWarning,
  suggestedCode,
} from "~/features/certificates/utils/certificate-form-selectors.utils";
import { formReducer } from "./certificate-form.reducer";
import {
  certificateFormBuilders,
  itemRow,
  orderDetail,
  orderRow,
  pickAction,
  signerValue,
} from "../../../../tests/helpers/certificate-form.factory";
import { testId } from "../../../../tests/helpers/test-ids.utils";

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
  {
    code: "IS141855DBA45",
    item: "Arsenal FC Original 2004–05 Away Shirt",
    signerNames: ["Dennis Bergkamp"],
    orderName: "#141855",
  },
];
const DICTIONARY = buildTeamDictionary(HISTORY);

const BAYERN_TITLE =
  "Robert Lewandowski Signed Bayern Munich Football Shirt - 2015-16 Home";
const BAYERN_ITEM = "Bayern Munich Football Shirt - 2015-16 Home";
const DORTMUND_TITLE =
  "Robert Lewandowski Signed Original Borussia Dortmund Football Shirt - 2011-12 Home";
const BAYERN_PRODUCT = {
  id: "gid://shopify/Product/101",
  title: BAYERN_TITLE,
  imageUrl: "https://cdn.shopify.com/s/files/bayern.jpg",
  status: "ACTIVE" as const,
};
const DORTMUND_PRODUCT = {
  id: "gid://shopify/Product/102",
  title: DORTMUND_TITLE,
  imageUrl: null,
  status: "DRAFT" as const,
};
const HENRY_PRODUCT = {
  id: "gid://shopify/Product/301",
  title: "Thierry Henry Signed Arsenal Home Shirt 2003-04",
  imageUrl: null,
  status: null,
};
const EMPTY_DATE: DateDraft = { dayUnknown: false, iso: "", view: null };
const EMPTY_DATE_AND_LOCATION = { date: EMPTY_DATE, location: "" };
const CONFLICT = "This code is already used for Robert Lewandowski.";
const FUTURE_DATE = "Date signed can't be in the future.";

const pickBayern = (overrides: Partial<OrderItemRow> = {}) =>
  pickAction(
    "#141002",
    itemRow(BAYERN_TITLE, { product: BAYERN_PRODUCT, ...overrides }),
  );

const { formValues, openForm } = certificateFormBuilders({
  values: { product: { ...BAYERN_PRODUCT, missing: false } },
  dictionary: DICTIONARY,
});

const create = () => openForm("create", formValues({ code: "", signers: [] }));

function run(state: FormState, ...actions: FormAction[]): FormState {
  return actions.reduce(formReducer, state);
}

function certificateDetail(values: CertificateFormValues): CertificateDetail {
  return {
    id: testId(7),
    values,
    pendingFileIds: [],
    orderCard: null,
    orderCertificates: [],
    mediaErrors: { photo: null, video: null },
    createdLabel: "26 Sep 2026",
    updatedLabel: "27 Sep 2026",
  };
}

const signerNames = (state: FormState) =>
  state.draft.signers.map((signer) => signer.name);
const day = (iso: string): DateDraft => ({
  dayUnknown: false,
  iso,
  view: null,
});
const signerTarget = (signerKey: string): DateAndLocationTarget => ({
  scope: "signer",
  signerKey,
});

function twoSignersApart(): FormState {
  const separated = run(
    create(),
    { type: "setSignerName", key: "s0", value: "Thierry Henry" },
    { type: "setDate", target: signerTarget("s0"), value: day("2025-03-03") },
    { type: "setLocation", target: signerTarget("s0"), value: "London" },
    { type: "addSigner" },
    { type: "setSharedOn", on: false },
  );

  return run(
    separated,
    { type: "setSignerName", key: "s1", value: "Dennis Bergkamp" },
    { type: "setDate", target: signerTarget("s1"), value: day("2024-10-29") },
    { type: "setLocation", target: signerTarget("s1"), value: "Amsterdam" },
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-27T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("opening the form", () => {
  it("opens a create form clean, in auto mode, with an empty code and one signer", () => {
    const created = create();

    expect(created.draft.code).toBe("");
    expect(created.codeMode).toBe("auto");
    expect(isDirty(created)).toBe(false);
    expect(signerMode(created.draft)).toBe("one");
    expect(codeDetails(created)).toBe(
      "A code is suggested when you select an order.",
    );
    expect(created.draft).toEqual(emptyDraft());
  });

  it("counts any edit and a pick as a change on create", () => {
    expect(isDirty(run(create(), { type: "setNotes", value: "Framed" }))).toBe(
      true,
    );
    expect(isDirty(run(create(), pickBayern()))).toBe(true);
    expect(
      isDirty(
        run(
          create(),
          { type: "setNotes", value: "Framed" },
          { type: "setNotes", value: "" },
        ),
      ),
    ).toBe(false);
  });

  it("opens a duplicate dirty, with the copy but no order, code or link", () => {
    const duplicate = openForm(
      "duplicate",
      formValues({
        signers: [signerValue("Robert Lewandowski", { location: "Munich" })],
      }),
    );

    expect(isDirty(duplicate)).toBe(true);
    expect(duplicate.codeMode).toBe("auto");
    expect(duplicate.draft.code).toBe("");
    expect(duplicate.draft.order).toBeNull();
    expect(duplicate.draft.lineItem).toBeNull();
    expect(duplicate.draft.item).toBe(BAYERN_ITEM);
    expect(duplicate.draft.derivedItem).toBe(BAYERN_ITEM);
    expect(duplicate.draft.product?.id).toBe(BAYERN_PRODUCT.id);
    expect(duplicate.draft.signers[0].own.location).toBe("Munich");
    expect(duplicate.draft.touched).toEqual({ item: false, product: false });
    expect(duplicate.baseline).toEqual(emptyDraft());
  });

  it("opens an edit clean, in manual mode, deriving the item from the linked title", () => {
    const edit = openForm("edit");

    expect(isDirty(edit)).toBe(false);
    expect(edit.codeMode).toBe("manual");
    expect(edit.savedCode).toBe("IS141002RLBM1516");
    expect(edit.draft.derivedItem).toBe(BAYERN_ITEM);
    expect(edit.draft.derivedProductId).toBe(BAYERN_PRODUCT.id);
    expect(codeDetails(edit)).toBe(
      "Customers enter this code on your verification page.",
    );
    expect(suggestedCode(edit)).toBeNull();
    expect(signerWarning(edit)).toBeNull();
  });

  it("opens in mode 2 only when every signer shares the date, its precision and the location", () => {
    const march = { precision: "DAY" as const, iso: "2025-03-03" };
    const same = openForm(
      "edit",
      formValues({
        signers: [
          signerValue("Thierry Henry", { date: march, location: "London" }),
          signerValue("Dennis Bergkamp", { date: march, location: "London" }),
        ],
      }),
    );
    const apart = openForm(
      "edit",
      formValues({
        signers: [
          signerValue("Thierry Henry", { date: march, location: "London" }),
          signerValue("Dennis Bergkamp", {
            date: { precision: "MONTH", iso: "2025-03" },
            location: "London",
          }),
        ],
      }),
    );

    expect(signerMode(same.draft)).toBe("shared");
    expect(same.draft.shared).toEqual({
      date: day("2025-03-03"),
      location: "London",
    });
    expect(same.draft.sharedBaseline).toEqual(same.draft.shared);
    expect(signerMode(apart.draft)).toBe("separate");
    expect(apart.draft.signers[1].own.date).toEqual({
      dayUnknown: true,
      month: "03",
      year: "2025",
    });
  });

  it("compares normalised values for the dirty check", () => {
    const edit = openForm("edit", formValues({ notes: "Line one\nLine two" }));
    const same = run(
      edit,
      { type: "setCode", value: " is141002rlbm1516 " },
      { type: "setNotes", value: "Line one\r\nLine two  " },
      { type: "setItem", value: `${BAYERN_ITEM} ` },
    );

    expect(projection(same.draft)).toBe(projection(edit.baseline));
    expect(isDirty(same)).toBe(false);
  });
});

describe("a pick", () => {
  it("fills item, product, signer and code on create", () => {
    const removed = itemRow("Gift card", {
      id: "gid://shopify/LineItem/2",
      state: "removed",
    });
    const item = itemRow(BAYERN_TITLE, { product: BAYERN_PRODUCT });
    const order = orderRow("#141002");
    const picked = run(create(), {
      type: "pick",
      order,
      item,
      detail: orderDetail(order, [item, removed]),
    });

    expect(picked.draft.item).toBe(BAYERN_ITEM);
    expect(picked.draft.product).toEqual({ ...BAYERN_PRODUCT, missing: false });
    expect(signerNames(picked)).toEqual(["Robert Lewandowski"]);
    expect(picked.draft.code).toBe("IS141002RLBM1516");
    expect(picked.draft.order).toEqual({
      id: "gid://shopify/Order/141002",
      name: "#141002",
    });
    expect(picked.draft.lineItem).toEqual({
      id: "gid://shopify/LineItem/1",
      title: BAYERN_TITLE,
    });
    expect(picked.draft.orderCard).toEqual({
      createdLabel: "26 Sep 2026 at 14:05",
      fulfillment: { label: "Unfulfilled", tone: "caution" },
      cancelled: false,
      selectableItems: 1,
      lineItem: { variantTitle: null, quantity: 1, imageUrl: null },
    });
    expect(filledLine(picked)).toBe(
      "Filled in from the order: item name, linked product, signer, and certificate code.",
    );
    expect(signerWarning(picked)).toBeNull();
    expect(codeDetails(picked)).toBe(
      "Suggested from the order number, signer initials, team, and season.",
    );
  });

  it("keeps an item typed in this draft", () => {
    const picked = run(
      create(),
      { type: "setItem", value: "Match-prepared home shirt" },
      pickBayern(),
    );

    expect(picked.draft.item).toBe("Match-prepared home shirt");
    expect(picked.draft.filled).not.toContain("item");
  });

  it("keeps a product linked or removed by hand in this draft", () => {
    const linked = run(
      create(),
      { type: "linkProduct", product: HENRY_PRODUCT },
      pickBayern(),
    );
    const removed = run(create(), { type: "removeProduct" }, pickBayern());

    expect(linked.draft.product?.id).toBe(HENRY_PRODUCT.id);
    expect(linked.draft.filled).not.toContain("product");
    expect(removed.draft.product).toBeNull();
    expect(filledLine(removed)).toBe(
      "Filled in from the order: item name, signer, and certificate code.",
    );
  });

  it("fills two names into an untouched section as mode 2 with empty shared values", () => {
    const picked = run(
      create(),
      pickAction(
        "#141004",
        itemRow(
          "Paul Scholes and Ryan Giggs Signed Manchester United 1998-00 Retro Shirt",
        ),
      ),
    );

    expect(signerNames(picked)).toEqual(["Paul Scholes", "Ryan Giggs"]);
    expect(signerMode(picked.draft)).toBe("shared");
    expect(picked.draft.shared).toEqual(EMPTY_DATE_AND_LOCATION);
    expect(picked.draft.filled).toContain("signers");
    expect(filledLine(picked)).toBe(
      "Filled in from the order: item name, signers, and certificate code.",
    );
  });

  it("writes names into a touched section with the Add signer rule", () => {
    const picked = run(
      create(),
      { type: "setLocation", target: signerTarget("s0"), value: "Manchester" },
      pickAction(
        "#141004",
        itemRow(
          "Paul Scholes and Ryan Giggs Signed Manchester United 1998-00 Retro Shirt",
        ),
      ),
    );

    expect(signerNames(picked)).toEqual(["Paul Scholes", "Ryan Giggs"]);
    expect(signerMode(picked.draft)).toBe("shared");
    expect(picked.draft.shared.location).toBe("Manchester");
  });

  it("never fills signers when a name is already listed", () => {
    const picked = run(
      create(),
      { type: "setSignerName", key: "s0", value: "Thomas Müller" },
      pickBayern(),
    );

    expect(signerNames(picked)).toEqual(["Thomas Müller"]);
    expect(picked.draft.filled).not.toContain("signer");
  });

  it("replaces a duplicate's copied item and clears its copied product", () => {
    const source: CodeHistoryItem = {
      code: "IS141855DBA45",
      item: "Arsenal FC Original 2004–05 Away Shirt",
      signerNames: ["Dennis Bergkamp"],
      orderName: "#141855",
      productId: "gid://shopify/Product/201",
    };
    const duplicate = openForm(
      "duplicate",
      formValues({
        code: source.code,
        item: source.item,
        product: {
          id: "gid://shopify/Product/201",
          title:
            "Dennis Bergkamp Signed Arsenal FC Original 2004–05 Away Shirt",
          imageUrl: null,
          status: "ACTIVE",
          missing: false,
        },
        signers: [signerValue("Dennis Bergkamp", { location: "London" })],
      }),
      withSeriesHint(DICTIONARY, source),
    );
    const picked = run(
      duplicate,
      pickAction(
        "#141003",
        itemRow(
          "Dennis Bergkamp Signed Arsenal FC Original 2003–04 Away Shirt",
        ),
      ),
    );

    expect(codeDetails(duplicate)).toBe(
      "A code is suggested when you select an order.",
    );
    expect(picked.draft.item).toBe("Arsenal FC Original 2003–04 Away Shirt");
    expect(picked.draft.product).toBeNull();
    expect(picked.draft.filled).toContain("product-removed");
    expect(filledLine(picked)).toBe(
      "Filled in from the order: item name and certificate code. The linked product was removed.",
    );
    expect(signerNames(picked)).toEqual(["Dennis Bergkamp"]);
    expect(picked.draft.signers[0].own.location).toBe("London");
    expect(picked.codeMode).toBe("auto");
    expect(picked.draft.code).toBe("IS141003DBA0304");
  });

  it("replaces an edit's item and product only while they still come from the previous item", () => {
    const dortmund = pickAction(
      "#141002",
      itemRow(DORTMUND_TITLE, {
        id: "gid://shopify/LineItem/2",
        product: DORTMUND_PRODUCT,
      }),
    );
    const repicked = run(openForm("edit"), dortmund);
    const typed = run(
      openForm(
        "edit",
        formValues({ item: "Bayern home shirt, match prepared" }),
      ),
      dortmund,
    );
    const empty = run(openForm("edit", formValues({ item: "" })), dortmund);
    const handLinked = run(
      openForm("edit"),
      { type: "linkProduct", product: HENRY_PRODUCT },
      dortmund,
    );

    expect(repicked.draft.item).toBe(
      "Original Borussia Dortmund Football Shirt - 2011-12 Home",
    );
    expect(repicked.draft.product?.id).toBe(DORTMUND_PRODUCT.id);
    expect(repicked.draft.code).toBe("IS141002RLBM1516");
    expect(filledLine(repicked)).toBe(
      "Filled in from the order: item name and linked product.",
    );
    expect(suggestedCode(repicked)).toBe("IS141002RLBD1112");
    expect(codeDetails(repicked)).toBe(
      "Customers enter this code on your verification page.",
    );
    expect(typed.draft.item).toBe("Bayern home shirt, match prepared");
    expect(empty.draft.item).toBe(
      "Original Borussia Dortmund Football Shirt - 2011-12 Home",
    );
    expect(handLinked.draft.product?.id).toBe(HENRY_PRODUCT.id);
  });

  it("clears an edit's previous product when the new item has none", () => {
    const repicked = run(
      openForm("edit"),
      pickAction(
        "#141002",
        itemRow(DORTMUND_TITLE, { id: "gid://shopify/LineItem/2" }),
      ),
    );

    expect(repicked.draft.product).toBeNull();
    expect(filledLine(repicked)).toBe(
      "Filled in from the order: item name. The linked product was removed.",
    );
  });

  it("keeps a product linked or removed by hand on edit", () => {
    const dortmund = pickAction(
      "#141002",
      itemRow(DORTMUND_TITLE, {
        id: "gid://shopify/LineItem/2",
        product: DORTMUND_PRODUCT,
      }),
    );
    const removed = run(openForm("edit"), { type: "removeProduct" }, dortmund);
    const relinked = run(
      openForm("edit"),
      { type: "linkProduct", product: BAYERN_PRODUCT },
      dortmund,
    );

    expect(removed.draft.product).toBeNull();
    expect(removed.draft.filled).toEqual(["item"]);
    expect(relinked.draft.product?.id).toBe(BAYERN_PRODUCT.id);
    expect(relinked.draft.filled).not.toContain("product");
  });

  it("fills only empty fields when a legacy certificate is linked, and never suggests the code it already names", () => {
    const legacy = formValues({
      code: "IS141909ARS0",
      item: "Arsenal Invincibles Home Shirt",
      order: { id: null, name: "#141909" },
      lineItem: null,
      product: null,
      signers: [signerValue("Thierry Henry")],
    });
    const henry = (name: string) =>
      pickAction(
        name,
        itemRow(HENRY_PRODUCT.title, {
          product: { ...HENRY_PRODUCT, status: "ACTIVE" },
        }),
      );
    const linked = run(openForm("edit", legacy), henry("#141909"));
    const other = run(openForm("edit", legacy), henry("#141950"));
    const keepsProduct = run(
      openForm("edit", {
        ...legacy,
        product: { ...BAYERN_PRODUCT, missing: false },
      }),
      pickAction("#141909", itemRow(HENRY_PRODUCT.title)),
    );

    expect(linked.draft.item).toBe("Arsenal Invincibles Home Shirt");
    expect(linked.draft.product?.id).toBe(HENRY_PRODUCT.id);
    expect(linked.draft.code).toBe("IS141909ARS0");
    expect(filledLine(linked)).toBe(
      "Filled in from the order: linked product.",
    );
    expect(suggestedCode(linked)).toBeNull();
    expect(suggestedCode(other)).toBe("IS141950THAI");
    expect(keepsProduct.draft.product?.id).toBe(BAYERN_PRODUCT.id);
    expect(keepsProduct.draft.filled).toEqual([]);
    expect(filledLine(keepsProduct)).toBeNull();
  });

  it("fills a legacy item only while it is empty, even after an earlier pick", () => {
    const legacy = formValues({
      code: "IS141909ARS0",
      item: "",
      order: { id: null, name: "#141909" },
      lineItem: null,
      product: null,
    });
    const first = run(
      openForm("edit", legacy),
      pickAction("#141909", itemRow(HENRY_PRODUCT.title)),
    );
    const second = run(first, pickAction("#141950", itemRow(BAYERN_TITLE)));

    expect(first.draft.item).toBe("Arsenal Home Shirt 2003-04");
    expect(second.draft.item).toBe("Arsenal Home Shirt 2003-04");
  });

  it("clears the order errors, also when the same item is picked again", () => {
    const full =
      "All certificates for this item are already created. Select another item.";
    const validated = run(create(), { type: "validate" });
    const picked = run(validated, pickBayern());
    const again = run(
      picked,
      { type: "serverErrors", errors: { lineItem: full } },
      pickBayern(),
    );

    expect(validated.errors.order).toBe("Select an order.");
    expect(picked.errors.order).toBeUndefined();
    expect(picked.errors.lineItem).toBeUndefined();
    expect(again.errors.lineItem).toBeUndefined();
  });
});

describe("the code", () => {
  it("switches to manual on typing, retargets on a new order and returns to auto when cleared", () => {
    const typed = run(create(), { type: "setCode", value: "is141002 x" });
    const picked = run(typed, pickBayern());
    const moved = run(picked, pickAction("#141003", itemRow(BAYERN_TITLE)));
    const kept = run(moved, { type: "codeBlur" });
    const cleared = run(
      moved,
      { type: "setCode", value: "" },
      { type: "codeBlur" },
    );

    expect(typed.draft.code).toBe("IS141002X");
    expect(typed.codeMode).toBe("manual");
    expect(codeDetails(typed)).toBe(
      "Customers enter this code on your verification page.",
    );
    expect(picked.draft.code).toBe("IS141002X");
    expect(suggestedCode(picked)).toBe("IS141002RLBM1516");
    expect(moved.draft.code).toBe("IS141003X");
    expect(moved.draft.filled).toContain("code");
    expect(kept.codeMode).toBe("manual");
    expect(cleared.codeMode).toBe("auto");
    expect(cleared.draft.code).toBe("IS141003RLBM1516");
  });

  it("hides the Suggested line in auto mode and when it equals the code", () => {
    const auto = run(create(), pickBayern());
    const same = run(auto, { type: "setCode", value: "IS141002RLBM1516" });

    expect(suggestedCode(auto)).toBeNull();
    expect(same.codeMode).toBe("manual");
    expect(suggestedCode(same)).toBeNull();
  });

  it("returns to auto with Use suggested code on create and sets the value on edit", () => {
    const manual = run(
      create(),
      pickBayern(),
      { type: "setCode", value: "IS141002ABC" },
      { type: "acceptSuggestedCode" },
    );
    const edit = run(
      openForm("edit"),
      pickAction(
        "#141002",
        itemRow(DORTMUND_TITLE, { id: "gid://shopify/LineItem/2" }),
      ),
      { type: "acceptSuggestedCode" },
    );
    const restored = run(edit, { type: "restoreOldCode" });

    expect(manual.codeMode).toBe("auto");
    expect(manual.draft.code).toBe("IS141002RLBM1516");
    expect(edit.codeMode).toBe("manual");
    expect(edit.draft.code).toBe("IS141002RLBD1112");
    expect(restored.draft.code).toBe("IS141002RLBM1516");
  });

  it("recomputes the auto code on applyAutoCode and never on edit", () => {
    const renamed = run(
      create(),
      pickBayern(),
      { type: "setSignerName", key: "s0", value: "Thomas Müller" },
      { type: "applyAutoCode" },
    );
    const edit = run(
      openForm("edit"),
      { type: "setSignerName", key: "s0", value: "Thomas Müller" },
      { type: "applyAutoCode" },
    );

    expect(renamed.draft.code).toBe("IS141002TMBM1516");
    expect(edit.draft.code).toBe("IS141002RLBM1516");
  });

  it("asks for a signer before the code is complete", () => {
    const unsigned = run(create(), pickAction("#141002", itemRow(BAYERN_ITEM)));

    expect(unsigned.draft.code).toBe("IS141002BM1516");
    expect(codeDetails(unsigned)).toBe(
      "Add who signed it to complete the code.",
    );
  });

  it("warns about low-confidence letters", () => {
    const picked = run(
      create(),
      pickAction(
        "#141002",
        itemRow("Zico Signed Brazil Football Photo - 1982 Goal"),
      ),
    );

    expect(codeSuggestion(picked).natural?.confidence).toBe("low");
    expect(codeDetails(picked)).toBe(
      "Check the letters after the order number before saving.",
    );
  });

  it("re-resolves a taken auto code silently and explains the dash", () => {
    const taken = run(create(), pickBayern(), {
      type: "codeTaken",
      code: "IS141002RLBM1516",
    });
    const fromDetail = run(
      create(),
      pickAction("#141002", itemRow(BAYERN_TITLE), {
        takenCodes: ["IS141002RLBM1516", "IS141002RLBM1516-2"],
      }),
    );

    expect(taken.draft.code).toBe("IS141002RLBM1516-2");
    expect(taken.codeMode).toBe("auto");
    expect(taken.errors.code).toBeUndefined();
    expect(codeSuggestion(taken).collision).toBe("dash");
    expect(codeDetails(taken)).toBe(
      "IS141002RLBM1516 is already used, so -2 was added.",
    );
    expect(fromDetail.draft.code).toBe("IS141002RLBM1516-3");
    expect(codeDetails(fromDetail)).toBe(
      "IS141002RLBM1516 is already used, so -3 was added.",
    );
  });

  it("keeps a manual code when it is reported taken but moves the suggestion", () => {
    const manual = run(
      create(),
      pickBayern(),
      { type: "setCode", value: "IS141002RLBM" },
      { type: "codeTaken", code: "IS141002RLBM1516" },
    );

    expect(manual.draft.code).toBe("IS141002RLBM");
    expect(suggestedCode(manual)).toBe("IS141002RLBM1516-2");
  });

  it("retries a rejected auto code once, then switches to manual with the error", () => {
    const picked = run(create(), pickBayern());
    const once = run(picked, {
      type: "autoCodeRejected",
      takenCodes: ["IS141002RLBM1516"],
      rejected: "IS141002RLBM1516",
      message: CONFLICT,
    });
    const unreadable = run(picked, {
      type: "autoCodeRejected",
      takenCodes: null,
      rejected: "IS141002RLBM1516",
      message: CONFLICT,
    });
    const twice = run(once, {
      type: "autoCodeRejected",
      takenCodes: ["IS141002RLBM1516", "IS141002RLBM1516-2"],
      rejected: "IS141002RLBM1516-2",
      message: CONFLICT,
    });

    expect(once.draft.code).toBe("IS141002RLBM1516-2");
    expect(once.autoRetried).toBe(true);
    expect(once.codeMode).toBe("auto");
    expect(unreadable.draft.code).toBe("IS141002RLBM1516-2");
    expect(twice.codeMode).toBe("manual");
    expect(twice.errors.code).toBe(CONFLICT);
  });

  it("switches an auto code to manual when the server rejects it", () => {
    const rejected = run(
      create(),
      pickBayern(),
      { type: "validate" },
      {
        type: "serverErrors",
        errors: { code: CONFLICT },
      },
    );

    expect(rejected.codeMode).toBe("manual");
    expect(rejected.errors.code).toBe(CONFLICT);
  });

  it("keeps auto mode when the server rejects other fields", () => {
    const rejected = run(
      create(),
      pickBayern(),
      { type: "validate" },
      {
        type: "serverErrors",
        errors: { item: "Use 200 characters or fewer." },
      },
    );

    expect(rejected.codeMode).toBe("auto");
    expect(rejected.errors).toEqual({ item: "Use 200 characters or fewer." });
  });

  it("clears the code error as soon as the merchant types in the field", () => {
    const retyped = run(
      create(),
      pickBayern(),
      { type: "serverErrors", errors: { code: CONFLICT } },
      { type: "setCode", value: "IS141002RLBM1516 " },
    );

    expect(retyped.errors.code).toBeUndefined();
  });
});

describe("the signers", () => {
  it("enters mode 2 from mode 1 with signer 1's values shared by everyone", () => {
    const added = run(
      create(),
      { type: "setDate", target: signerTarget("s0"), value: day("2025-03-03") },
      { type: "setLocation", target: signerTarget("s0"), value: "London" },
      { type: "addSigner" },
    );
    const london = { date: day("2025-03-03"), location: "London" };

    expect(signerMode(added.draft)).toBe("shared");
    expect(added.draft.shared).toEqual(london);
    expect(added.draft.sharedBaseline).toEqual(london);
    expect(added.draft.signers.map((signer) => signer.own)).toEqual([
      london,
      london,
    ]);
    expect(added.draft.signers[1]).toMatchObject({ key: "s1", name: "" });
    expect(sharedOverridesOthers(added.draft)).toBe(false);
  });

  it("restores the own values when unchecked with the shared values unchanged", () => {
    const apart = twoSignersApart();
    const restored = run(
      apart,
      { type: "setSharedOn", on: true },
      { type: "setSharedOn", on: false },
    );

    expect(signerMode(restored.draft)).toBe("separate");
    expect(restored.draft.signers.map((signer) => signer.own)).toEqual(
      apart.draft.signers.map((signer) => signer.own),
    );
  });

  it("copies the shared values to everyone when unchecked after a change", () => {
    const copied = run(
      twoSignersApart(),
      { type: "setSharedOn", on: true },
      { type: "setLocation", target: { scope: "shared" }, value: "Paris" },
      { type: "setSharedOn", on: false },
    );
    const paris = { date: day("2025-03-03"), location: "Paris" };

    expect(copied.draft.signers.map((signer) => signer.own)).toEqual([
      paris,
      paris,
    ]);
  });

  it("warns on re-check while other signers' own values differ", () => {
    const rechecked = run(twoSignersApart(), { type: "setSharedOn", on: true });

    expect(signerMode(rechecked.draft)).toBe("shared");
    expect(rechecked.draft.shared).toEqual({
      date: day("2025-03-03"),
      location: "London",
    });
    expect(rechecked.draft.signers[1].own.location).toBe("Amsterdam");
    expect(sharedOverridesOthers(rechecked.draft)).toBe(true);
  });

  it("adds a row with the shared values in mode 2 and the previous row's values in mode 3", () => {
    const shared = run(
      create(),
      { type: "setLocation", target: signerTarget("s0"), value: "London" },
      { type: "addSigner" },
      { type: "setLocation", target: { scope: "shared" }, value: "Paris" },
      { type: "addSigner" },
    );
    const apart = run(twoSignersApart(), { type: "addSigner" });

    expect(shared.draft.signers[2].own.location).toBe("Paris");
    expect(apart.draft.signers[2].own).toEqual(apart.draft.signers[1].own);
    expect(apart.draft.signers.map((signer) => signer.key)).toEqual([
      "s0",
      "s1",
      "s2",
    ]);
  });

  it("folds the shared values into the last row when removed down to one", () => {
    const folded = run(
      create(),
      { type: "addSigner" },
      { type: "setLocation", target: { scope: "shared" }, value: "Paris" },
      { type: "removeSigner", key: "s0" },
    );
    const apart = run(twoSignersApart(), { type: "removeSigner", key: "s1" });

    expect(signerMode(folded.draft)).toBe("one");
    expect(folded.draft.sharedOn).toBe(false);
    expect(folded.draft.signers).toEqual([
      { key: "s1", name: "", own: { date: EMPTY_DATE, location: "Paris" } },
    ]);
    expect(apart.draft.signers[0].own.location).toBe("London");
    expect(
      run(folded, { type: "removeSigner", key: "s1" }).draft.signers,
    ).toHaveLength(1);
  });

  it("moves a signer up and down within the list", () => {
    const threeSigners = run(
      create(),
      { type: "setSignerName", key: "s0", value: "A" },
      { type: "addSigner" },
      { type: "setSignerName", key: "s1", value: "B" },
      { type: "addSigner" },
      { type: "setSignerName", key: "s2", value: "C" },
    );
    const moved = (key: string, delta: -1 | 1) =>
      signerNames(run(threeSigners, { type: "moveSigner", key, delta }));

    expect(moved("s1", -1)).toEqual(["B", "A", "C"]);
    expect(moved("s1", 1)).toEqual(["A", "C", "B"]);
    expect(moved("s0", -1)).toEqual(["A", "B", "C"]);
    expect(moved("s2", 1)).toEqual(["A", "B", "C"]);
  });

  it("stops adding signers at 50", () => {
    const add: FormAction = { type: "addSigner" };
    const full = run(create(), ...Array<FormAction>(49).fill(add));
    const more = run(full, add);

    expect(full.draft.signers).toHaveLength(50);
    expect(more.draft.signers).toHaveLength(50);
    expect(new Set(more.draft.signers.map((signer) => signer.key)).size).toBe(
      50,
    );
  });
});

describe("toInput and client errors", () => {
  it("drops an empty Signer 2 in mode 2", () => {
    const withEmptyRow = run(
      create(),
      { type: "setSignerName", key: "s0", value: "Thierry Henry" },
      { type: "setLocation", target: signerTarget("s0"), value: "London" },
      { type: "addSigner" },
    );
    const { input, rowKeys } = toInput(withEmptyRow);

    expect(input.signers).toEqual([
      { name: "Thierry Henry", date: null, location: "London" },
    ]);
    expect(rowKeys).toEqual(["s0"]);
    expect(clientErrors(withEmptyRow)["signers.1.name"]).toBeUndefined();
  });

  it("applies the shared values to every signer in mode 2", () => {
    const shared = run(
      create(),
      { type: "setSignerName", key: "s0", value: "Paul Scholes" },
      { type: "addSigner" },
      { type: "setSignerName", key: "s1", value: "Ryan Giggs" },
      { type: "setLocation", target: { scope: "shared" }, value: "Manchester" },
    );

    expect(
      toInput(shared).input.signers.map((signer) => signer.location),
    ).toEqual(["Manchester", "Manchester"]);
  });

  it("reports the mode 2 shared date and location once, on the first signer sent", () => {
    const threeShared = run(
      create(),
      { type: "setSignerName", key: "s0", value: "Paul Scholes" },
      { type: "addSigner" },
      { type: "setSignerName", key: "s1", value: "Ryan Giggs" },
      { type: "addSigner" },
      { type: "setSignerName", key: "s2", value: "David Beckham" },
      {
        type: "setDate",
        target: { scope: "shared" },
        value: day("2026-12-01"),
      },
      {
        type: "setLocation",
        target: { scope: "shared" },
        value: "a".repeat(151),
      },
    );
    const apart = run(threeShared, { type: "setSharedOn", on: false });
    const signerErrors = (state: FormState) =>
      Object.fromEntries(
        Object.entries(clientErrors(state)).filter(([key]) =>
          key.startsWith("signers"),
        ),
      );

    expect(toInput(threeShared).rowKeys).toEqual(["s0", "s1", "s2"]);
    expect(signerErrors(threeShared)).toEqual({
      "signers.0.date": FUTURE_DATE,
      "signers.0.location": "Use 150 characters or fewer.",
    });
    expect(
      Object.keys(signerErrors(apart)).filter((key) => key.endsWith(".date")),
    ).toEqual(["signers.0.date", "signers.1.date", "signers.2.date"]);
  });

  it("sends a Day unknown date as a month", () => {
    const monthOnly = run(create(), {
      type: "setDate",
      target: signerTarget("s0"),
      value: { dayUnknown: true, month: "04", year: "2026" },
    });

    expect(toInput(monthOnly).input.signers[0].date).toEqual({
      precision: "MONTH",
      iso: "2026-04",
    });
  });

  it("asks for the missing half of a Day unknown date", () => {
    const dayUnknown = (month: string, year: string): FormAction => ({
      type: "setDate",
      target: signerTarget("s0"),
      value: { dayUnknown: true, month, year },
    });
    const noYear = clientErrors(run(create(), dayUnknown("04", "")));
    const noMonth = clientErrors(run(create(), dayUnknown("", "2026")));
    const tooOld = clientErrors(run(create(), dayUnknown("04", "1850")));

    expect(noYear["signers.0.year"]).toBe(
      "Enter a year between 1900 and 2026.",
    );
    expect(noMonth["signers.0.month"]).toBe("Choose a month.");
    expect(tooOld["signers.0.year"]).toBe(
      "Enter a year between 1900 and 2026.",
    );
    expect(tooOld["signers.0.date"]).toBeUndefined();
  });

  it("drops a row whose only change is a ticked Day unknown", () => {
    const added = run(twoSignersApart(), { type: "addSigner" });
    const blank = run(
      added,
      { type: "setSignerName", key: "s2", value: "" },
      { type: "setLocation", target: signerTarget("s2"), value: "" },
      {
        type: "setDate",
        target: signerTarget("s2"),
        value: { dayUnknown: true, month: "", year: "" },
      },
    );

    expect(toInput(blank).rowKeys).toEqual(["s0", "s1"]);
    expect(
      Object.keys(clientErrors(blank)).filter((key) =>
        key.startsWith("signers"),
      ),
    ).toEqual([]);
  });

  it("keys errors by the draft row after empty rows are dropped", () => {
    const withGap = run(
      create(),
      { type: "setSignerName", key: "s0", value: "Thierry Henry" },
      { type: "addSigner" },
      { type: "addSigner" },
      { type: "setSharedOn", on: false },
      { type: "setLocation", target: signerTarget("s2"), value: "London" },
      {
        type: "setDate",
        target: signerTarget("s2"),
        value: { dayUnknown: true, month: "", year: "2020" },
      },
    );
    const errors = clientErrors(withGap);

    expect(toInput(withGap).rowKeys).toEqual(["s0", "s2"]);
    expect(errors["signers.2.name"]).toBe("Enter the signer's name.");
    expect(errors["signers.2.month"]).toBe("Choose a month.");
    expect(errors["signers.1.name"]).toBeUndefined();
  });

  it("sends the order link only when the order has an id", () => {
    const legacy = openForm(
      "edit",
      formValues({ order: { id: null, name: "#141909" }, lineItem: null }),
    );
    const linked = run(
      legacy,
      pickAction("#141909", itemRow(HENRY_PRODUCT.title)),
    );

    expect(toInput(legacy).input.order).toBeNull();
    expect(toInput(legacy).input.lineItem).toBeNull();
    expect(clientErrors(legacy)).toEqual({});
    expect(toInput(linked).input.order).toEqual({
      id: "gid://shopify/Order/141909",
      name: "#141909",
    });
    expect(toInput(linked).input.lineItem).toEqual({
      id: "gid://shopify/LineItem/1",
      title: HENRY_PRODUCT.title,
    });
  });

  it("sends the product with its hint and the media by identity", () => {
    const edit = openForm(
      "edit",
      formValues({
        product: { ...BAYERN_PRODUCT, missing: true },
        photo: {
          source: "file",
          fileId: "gid://shopify/MediaImage/5",
          url: null,
          previewUrl: null,
        },
        video: { source: "url", url: "https://example.com/clip.mp4" },
        notes: "Framed\r\n",
      }),
    );
    const { input } = toInput(edit);

    expect(input.productId).toBe(BAYERN_PRODUCT.id);
    expect(input.productHint).toEqual({
      title: BAYERN_TITLE,
      imageUrl: BAYERN_PRODUCT.imageUrl,
    });
    expect(input.photo).toEqual({
      source: "file",
      fileId: "gid://shopify/MediaImage/5",
    });
    expect(input.video).toEqual({
      source: "url",
      url: "https://example.com/clip.mp4",
    });
    expect(input.notes).toBe("Framed");
  });

  it("requires an order on create and duplicate but not on edit", () => {
    const errors = clientErrors(create());

    expect(errors).toEqual({
      order: "Select an order.",
      code: "Enter a certificate code.",
      item: "Enter the item name.",
      "signers.0.name": "Enter the signer's name.",
    });
    expect(clientErrors(openForm("edit"))).toEqual({});
  });
});

describe("validation", () => {
  it("stores the errors on validate and re-validates every later edit", () => {
    const validated = run(create(), { type: "validate" });
    const typed = run(validated, { type: "setItem", value: "Home shirt" });

    expect(validated.attemptedSave).toBe(true);
    expect(validated.errors.item).toBe("Enter the item name.");
    expect(typed.errors.item).toBeUndefined();
    expect(typed.errors.order).toBe("Select an order.");
    expect(run(typed, { type: "setItem", value: "" }).errors.item).toBe(
      "Enter the item name.",
    );
  });

  it("keeps a server error until its own field changes", () => {
    const full =
      "All certificates for this item are already created. Select another item.";
    const rejected = run(
      create(),
      pickBayern(),
      { type: "validate" },
      {
        type: "serverErrors",
        errors: { lineItem: full },
      },
    );
    const edited = run(rejected, { type: "setNotes", value: "Framed" });
    const repicked = run(
      edited,
      pickAction(
        "#141002",
        itemRow(DORTMUND_TITLE, { id: "gid://shopify/LineItem/2" }),
      ),
    );

    expect(edited.errors.lineItem).toBe(full);
    expect(repicked.errors.lineItem).toBeUndefined();
  });

  it("maps server signer errors to the draft rows", () => {
    const mapped = run(
      create(),
      pickBayern(),
      { type: "addSigner" },
      { type: "addSigner" },
      { type: "setSharedOn", on: false },
      { type: "setSignerName", key: "s2", value: "robert lewandowski" },
      {
        type: "serverErrors",
        errors: { "signers.1.name": "This signer is already listed." },
      },
    );

    expect(mapped.errors).toEqual({
      "signers.2.name": "This signer is already listed.",
    });
  });

  it("keeps one server error for the mode 2 shared date, on the first signer sent", () => {
    const firstRowBlank = run(
      create(),
      { type: "addSigner" },
      { type: "setSignerName", key: "s1", value: "Paul Scholes" },
      { type: "addSigner" },
      { type: "setSignerName", key: "s2", value: "paul scholes" },
      {
        type: "serverErrors",
        errors: {
          "signers.0.date": FUTURE_DATE,
          "signers.1.name": "This signer is already listed.",
          "signers.1.date": FUTURE_DATE,
        },
      },
    );

    expect(toInput(firstRowBlank).rowKeys).toEqual(["s1", "s2"]);
    expect(firstRowBlank.errors).toEqual({
      "signers.1.date": FUTURE_DATE,
      "signers.2.name": "This signer is already listed.",
    });
  });
});

describe("linking a product", () => {
  it("fills an empty item from the product title and marks the product as set by hand", () => {
    const linked = run(create(), {
      type: "linkProduct",
      product: HENRY_PRODUCT,
    });

    expect(linked.draft.item).toBe("Arsenal Home Shirt 2003-04");
    expect(linked.draft.product).toEqual({ ...HENRY_PRODUCT, missing: false });
    expect(linked.draft.touched).toEqual({ item: false, product: true });
  });

  it("never overwrites a typed item and never clears it on remove", () => {
    const removed = run(
      create(),
      { type: "setItem", value: "Invincibles shirt" },
      { type: "linkProduct", product: HENRY_PRODUCT },
      { type: "removeProduct" },
    );

    expect(removed.draft.item).toBe("Invincibles shirt");
    expect(removed.draft.product).toBeNull();
    expect(removed.draft.touched).toEqual({ item: true, product: true });
  });

  it("replaces an item that still equals the last filled value", () => {
    const relinked = run(create(), pickBayern(), {
      type: "linkProduct",
      product: HENRY_PRODUCT,
    });

    expect(relinked.draft.item).toBe("Arsenal Home Shirt 2003-04");
  });
});

describe("the signer warning", () => {
  const listing = (name: string) =>
    openForm("duplicate", formValues({ signers: [signerValue(name)] }));

  it("names the parsed signer and offers to use it", () => {
    const picked = run(
      listing("Robert Lewandowski"),
      pickAction(
        "#141002",
        itemRow(
          "Thomas Müller Signed Bayern Munich Football Shirt - 2015-16 Home",
        ),
      ),
    );
    const used = run(picked, { type: "acceptHintName" });

    expect(signerWarning(picked)).toEqual({
      text: "The order item names Thomas Müller as the signer. This certificate lists Robert Lewandowski.",
      useName: "Thomas Müller",
    });
    expect(signerNames(used)).toEqual(["Thomas Müller"]);
    expect(signerWarning(used)).toBeNull();
  });

  it("ignores accents and letter case but catches a typo", () => {
    const kaka = run(
      listing("Kaká"),
      pickAction("#141002", itemRow("Kaka Signed AC Milan Shirt 2007-08")),
    );
    const cherki = run(
      listing("Rayan Cherki"),
      pickAction("#141002", itemRow("Ryan Cherki Signed Lyon Shirt 2023-24")),
    );

    expect(signerWarning(kaka)).toBeNull();
    expect(signerWarning(cherki)?.text).toBe(
      "The order item names Ryan Cherki as the signer. This certificate lists Rayan Cherki.",
    );
  });

  it("lists several names without a button", () => {
    const picked = run(
      listing("Paul Scholes"),
      pickAction(
        "#141004",
        itemRow(
          "Paul Scholes and Ryan Giggs Signed Manchester United 1998-00 Retro Shirt",
        ),
      ),
    );

    expect(signerWarning(picked)).toEqual({
      text: "The order item names Paul Scholes and Ryan Giggs as the signers. This certificate lists Paul Scholes.",
      useName: null,
    });
  });

  it("hides when dismissed, when the title has no names, after a save and on discard", () => {
    const muller = pickAction(
      "#141002",
      itemRow(
        "Thomas Müller Signed Bayern Munich Football Shirt - 2015-16 Home",
      ),
    );
    const edit = run(openForm("edit"), muller);
    const sent = projection(edit.draft);
    const saved = run(edit, {
      type: "saved",
      detail: certificateDetail(formValues()),
      sentProjection: sent,
    });

    expect(signerWarning(edit)).not.toBeNull();
    expect(
      signerWarning(run(edit, { type: "dismissSignerWarning" })),
    ).toBeNull();
    expect(
      signerWarning(
        run(openForm("edit"), pickAction("#141002", itemRow(BAYERN_ITEM))),
      ),
    ).toBeNull();
    expect(signerWarning(saved)).toBeNull();
    expect(signerWarning(run(edit, { type: "discard" }))).toBeNull();
  });
});

describe("saving and discarding", () => {
  it("adopts the saved values as baseline and draft when nothing changed during the save", () => {
    const edited = run(
      openForm("edit"),
      { type: "setNotes", value: "Framed" },
      {
        type: "validate",
      },
    );
    const saved = run(edited, {
      type: "saved",
      detail: certificateDetail(
        formValues({ notes: "Framed", code: "IS141002RLBM" }),
      ),
      sentProjection: projection(edited.draft),
    });

    expect(isDirty(saved)).toBe(false);
    expect(saved.draft).toBe(saved.baseline);
    expect(saved.baseline.notes).toBe("Framed");
    expect(saved.savedCode).toBe("IS141002RLBM");
    expect(saved.attemptedSave).toBe(false);
    expect(saved.errors).toEqual({});
  });

  it("keeps a draft that changed during the save dirty", () => {
    const edited = run(openForm("edit"), { type: "setNotes", value: "Framed" });
    const sent = projection(edited.draft);
    const saved = run(
      edited,
      { type: "setNotes", value: "Framed in black" },
      {
        type: "saved",
        detail: certificateDetail(formValues({ notes: "Framed" })),
        sentProjection: sent,
      },
    );

    expect(isDirty(saved)).toBe(true);
    expect(saved.draft.notes).toBe("Framed in black");
    expect(saved.baseline.notes).toBe("Framed");
  });

  it("resets the fill line, signer hint, taken codes and retry flag when the draft changed during the save", () => {
    const dortmund = pickAction(
      "#141002",
      itemRow(DORTMUND_TITLE, {
        id: "gid://shopify/LineItem/2",
        product: DORTMUND_PRODUCT,
      }),
    );
    const picked = run(openForm("edit"), dortmund, {
      type: "codeTaken",
      code: "IS141002RLBD1112",
    });
    const sending: FormState = { ...picked, autoRetried: true };
    const saved = run(
      sending,
      { type: "setNotes", value: "Framed" },
      {
        type: "saved",
        detail: certificateDetail(formValues()),
        sentProjection: projection(sending.draft),
      },
    );

    expect(picked.draft.filled).toEqual(["item", "product"]);
    expect(picked.draft.signerHint).toEqual(["Robert Lewandowski"]);
    expect(picked.draft.codesTakenLive).toEqual(["IS141002RLBD1112"]);
    expect(saved.draft.notes).toBe("Framed");
    expect(saved.draft.filled).toEqual([]);
    expect(saved.draft.signerHint).toBeNull();
    expect(saved.draft.codesTakenLive).toEqual([]);
    expect(saved.autoRetried).toBe(false);
  });

  it("keeps mode 3 after a save when the rows happen to match", () => {
    const march = { precision: "DAY" as const, iso: "2025-03-03" };
    const matching = run(
      twoSignersApart(),
      {
        type: "setDate",
        target: signerTarget("s1"),
        value: day("2025-03-03"),
      },
      { type: "setLocation", target: signerTarget("s1"), value: "London" },
    );
    const saved = run(matching, {
      type: "saved",
      detail: certificateDetail(
        formValues({
          signers: [
            signerValue("Thierry Henry", { date: march, location: "London" }),
            signerValue("Dennis Bergkamp", { date: march, location: "London" }),
          ],
        }),
      ),
      sentProjection: projection(matching.draft),
    });

    expect(signerMode(saved.draft)).toBe("separate");
    expect(saved.draft.signers.map((signer) => signer.key)).toEqual([
      "s0",
      "s1",
    ]);
  });

  it("returns to the baseline on discard", () => {
    const discarded = run(
      openForm("edit"),
      { type: "setItem", value: "Other shirt" },
      { type: "validate" },
      { type: "discard" },
    );

    expect(isDirty(discarded)).toBe(false);
    expect(discarded.draft).toEqual(discarded.baseline);
    expect(discarded.errors).toEqual({});
    expect(discarded.attemptedSave).toBe(false);
  });

  it("returns a create or duplicate to its baseline in auto mode on discard", () => {
    const created = run(
      create(),
      pickBayern(),
      { type: "setCode", value: "IS141002RLBM" },
      { type: "validate" },
      { type: "discard" },
    );
    const duplicated = run(
      openForm("duplicate"),
      { type: "setCode", value: "IS141002RLBM" },
      { type: "discard" },
    );

    expect(created.draft).toBe(created.baseline);
    expect(created.codeMode).toBe("auto");
    expect(created.errors).toEqual({});
    expect(created.attemptedSave).toBe(false);
    expect(isDirty(created)).toBe(false);
    expect(duplicated.draft).toBe(duplicated.baseline);
    expect(duplicated.codeMode).toBe("auto");
    expect(isDirty(duplicated)).toBe(false);
  });

  it("updates the media when a pending file completes", () => {
    const pending = {
      source: "file" as const,
      fileId: "gid://shopify/MediaImage/5",
      url: null,
      previewUrl: null,
    };
    const ready = {
      ...pending,
      url: "https://cdn.shopify.com/s/files/proof.jpg",
    };
    const edit = openForm("edit", formValues({ photo: pending }));
    const completed = run(edit, {
      type: "mediaCompleted",
      detail: certificateDetail(formValues({ photo: ready })),
    });
    const replaced = run(
      edit,
      {
        type: "setMedia",
        kind: "photo",
        value: { source: "url", url: "https://example.com/other.jpg" },
      },
      {
        type: "mediaCompleted",
        detail: certificateDetail(formValues({ photo: ready })),
      },
    );

    expect(completed.baseline.photo).toEqual(ready);
    expect(completed.draft.photo).toEqual(ready);
    expect(isDirty(completed)).toBe(false);
    expect(replaced.baseline.photo).toEqual(ready);
    expect(replaced.draft.photo).toEqual({
      source: "url",
      url: "https://example.com/other.jpg",
    });
  });
});
