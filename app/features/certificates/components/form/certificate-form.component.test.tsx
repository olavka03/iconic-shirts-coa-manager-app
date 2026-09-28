import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { createRoutesStub, useLocation, useNavigationType } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useFilePolling,
  type FilePollingOptions,
} from "~/features/media/hooks/use-file-polling.hook";
import { requestJson } from "~/shared/utils/json-request.utils";
import { LAST_INDEX_SEARCH_KEY } from "~/features/certificates/hooks/use-last-index-search.hook";
import type { CodeHistoryItem } from "~/features/codes/types/code-generator.types";
import { buildTeamDictionary } from "~/features/codes/utils/team-dictionary.utils";
import type { CertificateDetail } from "~/features/certificates/types/certificates.types";
import type { MediaStatus } from "~/features/media/types/media.types";
import { EMPTY_VALUES } from "~/features/certificates/constants/certificate-form.constants";
import type { CertificateFormProps } from "~/features/certificates/types/certificate-form.types";
import { CertificateForm } from "./certificate-form.component";
import type { MediaFieldProps } from "~/features/media/types/media-field.types";
import type { OrderPickerProps } from "~/features/orders/components/order-picker.component";
import type { OrderPick } from "~/features/orders/types/order-picker.types";
import {
  certificateFormBuilders,
  itemRow,
  orderDetail,
  orderRow,
} from "../../../../../tests/helpers/certificate-form.factory";
import {
  deferred,
  jsonResponse,
  stubFetch,
} from "../../../../../tests/helpers/fetch-stub.utils";
import { typeInto } from "../../../../../tests/helpers/polaris-dom.utils";
import { testId } from "../../../../../tests/helpers/test-ids.utils";

const stubs = vi.hoisted(() => ({
  picker: { props: null as OrderPickerProps | null, prepare: vi.fn() },
  media: {} as Partial<Record<"photo" | "video", MediaFieldProps>>,
}));

vi.mock("@shopify/app-bridge-react", async () => {
  const { createElement } = await import("react");

  function SaveBarStub({
    open,
    children,
  }: {
    open?: boolean;
    children?: ReactNode;
  }) {
    return open
      ? createElement("div", { "data-testid": "save-bar" }, children)
      : null;
  }

  return { SaveBar: SaveBarStub };
});

vi.mock("~/features/orders/components/order-picker.component", async () => {
  const { useImperativeHandle } = await import("react");

  function OrderPickerStub(props: OrderPickerProps) {
    stubs.picker.props = props;
    useImperativeHandle(props.ref, () => ({ prepare: stubs.picker.prepare }));

    return null;
  }

  return { OrderPicker: OrderPickerStub };
});

vi.mock("~/features/media/components/media-field.component", () => ({
  MediaField: (props: MediaFieldProps) => {
    stubs.media[props.kind] = props;

    return null;
  },
}));

vi.mock("~/features/media/hooks/use-file-polling.hook", () => ({
  useFilePolling: vi.fn(),
}));

vi.mock("~/shared/utils/json-request.utils", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("~/shared/utils/json-request.utils")
  >()),
  requestJson: vi.fn(),
}));

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
const BAYERN_CODE = "IS141002RLBM1516";
const BAYERN_PRODUCT = {
  id: "gid://shopify/Product/101",
  title: BAYERN_TITLE,
  imageUrl: null,
  status: "ACTIVE" as const,
};
const ORDER_ID = "gid://shopify/Order/141002";
const LINE_ITEM_ID = "gid://shopify/LineItem/1";
const PHOTO_ID = "gid://shopify/MediaImage/9";
const PHOTO_URL =
  "https://cdn.shopify.com/s/files/1/0001/files/lewandowski.jpg";
const CONFLICT =
  "This code is already used for Robert Lewandowski, Bayern Munich Football Shirt - 2015-16 Home.";

const ORDER = orderRow("#141002", { itemSummary: BAYERN_TITLE });
const ITEM = itemRow(BAYERN_TITLE, { product: BAYERN_PRODUCT });

const BAYERN_PICK: OrderPick = {
  order: ORDER,
  item: ITEM,
  detail: orderDetail(ORDER, [ITEM]),
};

const { formValues: savedValues } = certificateFormBuilders({
  values: { product: { ...BAYERN_PRODUCT, missing: false } },
});

function certificateDetail(
  overrides: Partial<CertificateDetail> = {},
): CertificateDetail {
  return {
    id: testId(7),
    values: savedValues(),
    pendingFileIds: [],
    orderCard: {
      createdLabel: "26 Sep 2026 at 14:05",
      fulfillment: { label: "Fulfilled", tone: "success" },
      cancelled: false,
      selectableItems: 1,
      lineItem: { variantTitle: null, quantity: 1, imageUrl: null },
    },
    orderCertificates: [],
    mediaErrors: { photo: null, video: null },
    createdLabel: "26 Sep 2026",
    updatedLabel: "27 Sep 2026",
    ...overrides,
  };
}

function createProps(duplicateMissing = false): CertificateFormProps {
  return {
    kind: "create",
    initial: EMPTY_VALUES,
    codeDictionary: DICTIONARY,
    codePrefix: "IS",
    duplicateMissing,
  };
}

function duplicateProps(): CertificateFormProps {
  return {
    kind: "duplicate",
    initial: savedValues({
      code: "",
      item: "AC Milan Home Shirt 1994-95",
      order: null,
      lineItem: null,
      product: null,
      signers: [{ name: "Paolo Maldini", date: null, location: "" }],
    }),
    codeDictionary: DICTIONARY,
    codePrefix: "IS",
    duplicateOf: { id: testId(3), code: "IS141816PMM" },
  };
}

function editProps(certificate = certificateDetail()): CertificateFormProps {
  return {
    kind: "edit",
    certificate,
    codeDictionary: DICTIONARY,
    codePrefix: "IS",
  };
}

type SentRequest = { url: string; body: unknown };

// Code checks always come back free; every other request goes to the test's answer.
function serve(answer: (sent: SentRequest) => unknown) {
  vi.mocked(requestJson).mockImplementation(((
    url: string,
    requestInit?: { body?: unknown },
  ) => {
    if (url.startsWith("/api/codes?")) {
      return Promise.resolve({
        code: "",
        error: null,
        available: true,
        usedBy: null,
      });
    }

    return Promise.resolve(answer({ url, body: requestInit?.body }));
  }) as typeof requestJson);
}

function inOrder(...responses: unknown[]) {
  return () => {
    if (responses.length === 0) {
      throw new Error("No more responses");
    }

    return responses.shift();
  };
}

function sentTo(prefix: string): SentRequest[] {
  return vi
    .mocked(requestJson)
    .mock.calls.filter(([url]) => url.startsWith(prefix))
    .map(([url, requestInit]) => ({ url, body: requestInit?.body }));
}

function PageProbe() {
  const location = useLocation();
  const navigationType = useNavigationType();

  return (
    <output data-testid="page" data-navigation={navigationType}>
      {`${location.pathname}${location.search}`}
    </output>
  );
}

async function renderForm(props: CertificateFormProps) {
  const formPath =
    props.kind === "edit"
      ? `/app/certificates/${props.certificate.id}`
      : "/app/certificates/new";

  function FormRoute() {
    return <CertificateForm {...props} />;
  }

  const RoutesStub = createRoutesStub([
    { path: formPath, Component: FormRoute },
    { path: "/app/certificates/:id", Component: PageProbe },
    { path: "/app", Component: PageProbe },
  ]);

  render(<RoutesStub initialEntries={[formPath]} />);
  await waitFor(() => expect(document.querySelector("s-page")).not.toBeNull());
}

function element(selector: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(selector);

  if (!found) {
    throw new Error(`Nothing matches ${selector}`);
  }

  return found;
}

function fieldByLabel(label: string): HTMLElement {
  return element(`[label="${label}"]`);
}

function fieldValue(field: HTMLElement): string | null {
  return (field as { value?: string }).value ?? field.getAttribute("value");
}

function tick(checkbox: HTMLElement) {
  Object.assign(checkbox, { checked: true });
  fireEvent.input(checkbox);
}

function saveBarButton(label: "Save" | "Discard"): HTMLButtonElement {
  return within(screen.getByTestId("save-bar")).getByText(
    label,
  ) as HTMLButtonElement;
}

function banner(heading: string): HTMLElement {
  return element(`s-banner[heading="${heading}"]`);
}

function byText(selector: string, text: string): HTMLElement {
  const match = [...document.querySelectorAll<HTMLElement>(selector)].find(
    (found) => found.textContent?.trim() === text,
  );

  if (!match) {
    throw new Error(`No ${selector} reads "${text}"`);
  }

  return match;
}

function pickBayern() {
  act(() => stubs.picker.props?.onPick(BAYERN_PICK));
}

async function currentPage(): Promise<HTMLElement> {
  return screen.findByTestId("page");
}

beforeEach(() => {
  vi.mocked(requestJson).mockReset();
  vi.mocked(useFilePolling).mockReset();
  stubs.picker.props = null;
  stubs.media = {};
  sessionStorage.clear();
  serve(({ url }) => {
    throw new Error(`Unexpected request ${url}`);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CertificateForm on create", () => {
  it("opens at the order step with Select order focused and no save bar", async () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus");

    await renderForm(createProps());

    expect(element("s-page").getAttribute("heading")).toBe("New certificate");
    expect(document.getElementById("select-order")).not.toBeNull();
    expect(screen.queryByTestId("save-bar")).toBeNull();
    expect(focus.mock.contexts.at(-1)).toBe(
      document.getElementById("select-order"),
    );
    expect(stubs.picker.props).toMatchObject({
      excludeId: null,
      currentOrderId: null,
      prefetch: true,
    });
  });

  it("lists the missing order in the summary and focuses Select order after Save", async () => {
    await renderForm(createProps());
    typeInto(fieldByLabel("Certificate code"), "IS141002ABC");
    typeInto(fieldByLabel("Item"), BAYERN_ITEM);
    typeInto(fieldByLabel("Name"), "Robert Lewandowski");
    const focus = vi.spyOn(HTMLElement.prototype, "focus");

    fireEvent.click(saveBarButton("Save"));

    const summary = await waitFor(() =>
      banner("There is 1 error with this certificate"),
    );

    expect(summary.textContent).toBe("Order: Select an order.");
    expect(focus.mock.contexts.at(-1)).toBe(
      document.getElementById("select-order"),
    );
    expect(sentTo("/api/certificates")).toEqual([]);
  });

  it("moves focus to the first invalid field again on every failed Save", async () => {
    await renderForm(createProps());
    typeInto(fieldByLabel("Item"), BAYERN_ITEM);
    typeInto(fieldByLabel("Name"), "Robert Lewandowski");
    fireEvent.click(saveBarButton("Save"));
    await waitFor(() => banner("There are 2 errors with this certificate"));
    typeInto(fieldByLabel("Certificate code"), "IS141002ABC");
    const focus = vi.spyOn(HTMLElement.prototype, "focus");

    fireEvent.click(saveBarButton("Save"));

    const summary = await waitFor(() =>
      banner("There is 1 error with this certificate"),
    );

    expect(summary.textContent).toBe("Order: Select an order.");
    expect(focus.mock.contexts.at(-1)).toBe(
      document.getElementById("select-order"),
    );
  });

  it("fills in the item, signer, and code from a pick and opens the save bar", async () => {
    await renderForm(createProps());
    const focus = vi.spyOn(HTMLElement.prototype, "focus");

    pickBayern();

    expect(fieldValue(fieldByLabel("Item"))).toBe(BAYERN_ITEM);
    expect(fieldValue(fieldByLabel("Name"))).toBe("Robert Lewandowski");
    expect(fieldValue(fieldByLabel("Certificate code"))).toBe(BAYERN_CODE);
    expect(screen.getByTestId("save-bar")).toBeTruthy();
    expect(focus.mock.contexts.at(-1)).toBe(
      document.getElementById("change-order"),
    );
  });

  it("creates the certificate, replaces the URL with its page, and shows a toast", async () => {
    serve(inOrder({ ok: true, id: testId(12), code: BAYERN_CODE }));
    await renderForm(createProps());
    pickBayern();

    fireEvent.click(saveBarButton("Save"));

    const page = await currentPage();

    expect(page.textContent).toBe(`/app/certificates/${testId(12)}`);
    expect(page.dataset.navigation).toBe("REPLACE");
    expect(shopify.saveBar.hide).toHaveBeenCalledWith("certificate-save-bar");
    expect(sentTo("/api/certificates")).toEqual([
      {
        url: "/api/certificates",
        body: {
          intent: "create",
          values: expect.objectContaining({
            code: BAYERN_CODE,
            item: BAYERN_ITEM,
            order: { id: ORDER_ID, name: "#141002" },
            lineItem: { id: LINE_ITEM_ID, title: BAYERN_TITLE },
            signers: [
              { name: "Robert Lewandowski", date: null, location: null },
            ],
          }),
        },
      },
    ]);
    expect(shopify.toast.show).toHaveBeenCalledWith("Certificate created");
    expect(shopify.saveBar.leaveConfirmation).not.toHaveBeenCalled();
  });

  it("re-reads the order's codes and submits a taken auto code once more with the next free code", async () => {
    const orders = deferred<unknown>();
    const posts = inOrder(
      { ok: false, fieldErrors: { code: CONFLICT } },
      { ok: true, id: testId(12), code: `${BAYERN_CODE}-2` },
    );

    serve(({ url }) =>
      url.startsWith("/api/orders") ? orders.promise : posts(),
    );
    await renderForm(createProps());
    pickBayern();

    fireEvent.click(saveBarButton("Save"));

    await waitFor(() => expect(sentTo("/api/orders")).toHaveLength(1));
    expect(saveBarButton("Save").getAttribute("loading")).toBe("");
    expect(saveBarButton("Discard").disabled).toBe(true);
    await act(async () =>
      orders.resolve({
        ok: true,
        detail: orderDetail(ORDER, [ITEM], { takenCodes: [BAYERN_CODE] }),
      }),
    );

    expect((await currentPage()).textContent).toBe(
      `/app/certificates/${testId(12)}`,
    );
    expect(sentTo("/api/orders").map((sent) => sent.url)).toEqual([
      "/api/orders?id=141002",
    ]);
    expect(sentTo("/api/certificates").map((sent) => sent.body)).toEqual([
      {
        intent: "create",
        values: expect.objectContaining({ code: BAYERN_CODE }),
      },
      {
        intent: "create",
        values: expect.objectContaining({ code: `${BAYERN_CODE}-2` }),
      },
    ]);
  });

  it("hands the code to the merchant when the automatic retry is taken too", async () => {
    const posts = inOrder(
      { ok: false, fieldErrors: { code: CONFLICT } },
      { ok: false, fieldErrors: { code: CONFLICT } },
    );

    serve(({ url }) =>
      url.startsWith("/api/orders")
        ? { ok: false, formError: "unavailable" }
        : posts(),
    );
    await renderForm(createProps());
    pickBayern();

    fireEvent.click(saveBarButton("Save"));

    const summary = await waitFor(() =>
      banner("There is 1 error with this certificate"),
    );
    const codeField = fieldByLabel("Certificate code");

    expect(summary.textContent).toBe(`Certificate code: ${CONFLICT}`);
    expect(codeField.getAttribute("error")).toBe(CONFLICT);
    expect(codeField.getAttribute("details")).toBe(
      "Customers enter this code on your verification page.",
    );
    expect(sentTo("/api/certificates")).toHaveLength(2);
    expect(sentTo("/api/certificates")[1].body).toEqual({
      intent: "create",
      values: expect.objectContaining({ code: `${BAYERN_CODE}-2` }),
    });
    expect(screen.queryByTestId("page")).toBeNull();
  });

  it("keeps the form and its values when the request fails", async () => {
    const { requestJson: realRequestJson } = await vi.importActual<
      typeof import("~/shared/utils/json-request.utils")
    >("~/shared/utils/json-request.utils");
    const fetchMock = stubFetch(async (url) => {
      if (url.startsWith("/api/codes?")) {
        return jsonResponse({
          code: "",
          error: null,
          available: true,
          usedBy: null,
        });
      }

      throw new TypeError("Failed to fetch");
    });

    vi.mocked(requestJson).mockImplementation(realRequestJson);
    await renderForm(createProps());
    pickBayern();

    fireEvent.click(saveBarButton("Save"));

    const failure = await waitFor(() =>
      banner("This certificate couldn't be saved"),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/certificates",
      expect.objectContaining({ method: "POST" }),
    );
    expect(failure.getAttribute("tone")).toBe("critical");
    expect(failure.textContent).toBe("Check your connection and try again.");
    expect(fieldValue(fieldByLabel("Item"))).toBe(BAYERN_ITEM);
    expect(fieldValue(fieldByLabel("Certificate code"))).toBe(BAYERN_CODE);
    expect(saveBarButton("Save").disabled).toBe(false);
    expect(element("s-page").getAttribute("heading")).toBe("New certificate");
  });

  it("disables Save while a media field is busy and keeps the bar open for an upload", async () => {
    await renderForm(createProps());

    act(() => stubs.media.photo?.onBusyChange(true));

    expect(saveBarButton("Save").disabled).toBe(true);
    expect(saveBarButton("Discard").disabled).toBe(false);

    act(() => stubs.media.photo?.onBusyChange(false));

    expect(screen.queryByTestId("save-bar")).toBeNull();

    typeInto(fieldByLabel("Item"), BAYERN_ITEM);
    act(() => stubs.media.video?.onBusyChange(true));

    expect(saveBarButton("Save").disabled).toBe(true);

    act(() => stubs.media.video?.onBusyChange(false));

    expect(saveBarButton("Save").disabled).toBe(false);
  });

  it("goes back to the last index URL on Discard and cancels uploads", async () => {
    sessionStorage.setItem(LAST_INDEX_SEARCH_KEY, "?q=bayern");
    await renderForm(createProps());
    typeInto(fieldByLabel("Item"), BAYERN_ITEM);

    const formMountedAtHide: boolean[] = [];

    vi.mocked(shopify.saveBar.hide).mockImplementation(async () => {
      formMountedAtHide.push(document.querySelector("s-page") !== null);
    });
    fireEvent.click(saveBarButton("Discard"));

    expect((await currentPage()).textContent).toBe("/app?q=bayern");
    expect(shopify.saveBar.hide).toHaveBeenCalledWith("certificate-save-bar");
    expect(formMountedAtHide[0]).toBe(true);
    expect(shopify.saveBar.leaveConfirmation).not.toHaveBeenCalled();
    expect(stubs.media.photo?.discardToken).toBe(1);
    expect(stubs.media.video?.discardToken).toBe(1);
  });

  it("hides the save bar when the form unmounts", async () => {
    await renderForm(createProps());
    typeInto(fieldByLabel("Item"), BAYERN_ITEM);
    vi.mocked(shopify.saveBar.hide).mockClear();

    cleanup();

    expect(shopify.saveBar.hide).toHaveBeenCalledWith("certificate-save-bar");
  });

  it("goes back to the last index URL from the back button", async () => {
    sessionStorage.setItem(LAST_INDEX_SEARCH_KEY, "?q=bayern");
    await renderForm(createProps());

    const back = element('s-button[accessibilityLabel="Back to certificates"]');

    expect(back.textContent).toBe("Certificates");
    expect(back.getAttribute("icon")).toBe("chevron-left");
    expect(back.getAttribute("variant")).toBe("tertiary");
    expect(back.getAttribute("href")).toBe("/app?q=bayern");
    expect(back.parentElement!.getAttribute("slot")).toBe("supplemental-start");
    expect(back.parentElement!.parentElement!.tagName).toBe("S-PAGE");
    expect(element("s-page").querySelector('[slot="supplemental-start"]')).toBe(
      back.parentElement,
    );

    fireEvent.click(back);

    expect((await currentPage()).textContent).toBe("/app?q=bayern");
    expect(shopify.saveBar.leaveConfirmation).not.toHaveBeenCalled();
  });

  it("asks before leaving a changed draft from the back button", async () => {
    let confirm: () => void = () => {};

    vi.mocked(shopify.saveBar.leaveConfirmation).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          confirm = resolve;
        }),
    );
    await renderForm(createProps());
    typeInto(fieldByLabel("Item"), BAYERN_ITEM);

    fireEvent.click(
      element('s-button[accessibilityLabel="Back to certificates"]'),
    );

    await waitFor(() =>
      expect(shopify.saveBar.leaveConfirmation).toHaveBeenCalled(),
    );
    expect(screen.queryByTestId("page")).toBeNull();

    await act(async () => confirm());

    expect((await currentPage()).textContent).toBe("/app");
  });

  it("explains a missing duplicate source on a blank form", async () => {
    await renderForm(createProps(true));

    const infoBanner = element('s-banner[tone="info"]');

    expect(infoBanner.textContent).toBe(
      "The certificate you tried to duplicate no longer exists.",
    );
    expect(fieldValue(fieldByLabel("Item"))).toBe("");
    expect(screen.queryByTestId("save-bar")).toBeNull();
    expect(element("s-page").getAttribute("heading")).toBe("New certificate");
  });
});

describe("CertificateForm on duplicate", () => {
  it("shows the source code, opens the save bar at once, and discards back to the source", async () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus");

    await renderForm(duplicateProps());

    expect(
      element('s-section[heading="Certificate"]').getAttribute("subheading"),
    ).toBe("Copied from IS141816PMM");
    expect(fieldValue(fieldByLabel("Item"))).toBe(
      "AC Milan Home Shirt 1994-95",
    );
    expect(focus.mock.contexts.at(-1)).toBe(
      document.getElementById("select-order"),
    );
    expect(screen.getByTestId("save-bar")).toBeTruthy();

    fireEvent.click(saveBarButton("Discard"));

    expect((await currentPage()).textContent).toBe(
      `/app/certificates/${testId(3)}`,
    );
    expect(shopify.saveBar.hide).toHaveBeenCalledWith("certificate-save-bar");
    expect(shopify.saveBar.leaveConfirmation).not.toHaveBeenCalled();
  });
});

describe("CertificateForm on edit", () => {
  it("saves, shows a toast, and puts the new code in the heading", async () => {
    const saved = certificateDetail({
      values: savedValues({ code: "IS141002LEWY" }),
      updatedLabel: "28 Sep 2026",
    });

    serve(inOrder({ ok: true, certificate: saved }));
    await renderForm(editProps());

    expect(element("s-page").getAttribute("heading")).toBe(BAYERN_CODE);
    expect(stubs.picker.props).toMatchObject({
      excludeId: testId(7),
      currentOrderId: ORDER_ID,
      prefetch: false,
    });

    typeInto(fieldByLabel("Certificate code"), "is141002lewy");
    fireEvent.click(saveBarButton("Save"));

    await waitFor(() =>
      expect(shopify.toast.show).toHaveBeenCalledWith("Certificate saved"),
    );
    expect(sentTo(`/api/certificates/${testId(7)}`)).toEqual([
      {
        url: `/api/certificates/${testId(7)}`,
        body: {
          intent: "update",
          values: expect.objectContaining({ code: "IS141002LEWY" }),
        },
      },
    ]);
    expect(element("s-page").getAttribute("heading")).toBe("IS141002LEWY");
    expect(screen.queryByTestId("save-bar")).toBeNull();
  });

  it("says the certificate may have been deleted when the update finds nothing", async () => {
    serve(inOrder({ ok: false, formError: "not_found" }));
    await renderForm(editProps());
    typeInto(fieldByLabel("Item"), "Bayern Munich Home Shirt 2015-16");

    fireEvent.click(saveBarButton("Save"));

    const failure = await waitFor(() =>
      banner("This certificate couldn't be saved"),
    );

    expect(failure.textContent).toBe("It may have been deleted.");
    expect(fieldValue(fieldByLabel("Item"))).toBe(
      "Bayern Munich Home Shirt 2015-16",
    );
  });

  it("leaves focus in the field being typed in when errors appear after a failed request", async () => {
    serve(inOrder({ ok: false, formError: "unavailable" }));
    await renderForm(editProps());
    typeInto(fieldByLabel("Item"), "Bayern Munich Home Shirt 2015-16");
    fireEvent.click(saveBarButton("Save"));
    await waitFor(() => banner("This certificate couldn't be saved"));
    const focus = vi.spyOn(HTMLElement.prototype, "focus");

    tick(fieldByLabel("Day unknown"));
    typeInto(fieldByLabel("Year"), "2");

    expect(banner("There are 2 errors with this certificate")).toBeTruthy();
    expect(focus).not.toHaveBeenCalled();

    fireEvent.click(saveBarButton("Save"));

    await waitFor(() =>
      expect(focus.mock.contexts.at(-1)).toBe(fieldByLabel("Month")),
    );
  });

  it("leaves focus in the field being typed in when a fixed error comes back", async () => {
    await renderForm(editProps());
    typeInto(fieldByLabel("Item"), "");
    fireEvent.click(saveBarButton("Save"));
    await waitFor(() => banner("There is 1 error with this certificate"));
    typeInto(fieldByLabel("Item"), "Bayern Munich Home Shirt 2015-16");

    expect(document.querySelector('s-banner[tone="critical"]')).toBeNull();

    const focus = vi.spyOn(HTMLElement.prototype, "focus");

    typeInto(fieldByLabel("Item"), "");

    expect(banner("There is 1 error with this certificate")).toBeTruthy();
    expect(focus).not.toHaveBeenCalled();
  });

  it("resets the draft on Discard and cancels uploads", async () => {
    await renderForm(editProps());
    typeInto(fieldByLabel("Item"), "Bayern Munich Home Shirt 2015-16");

    fireEvent.click(saveBarButton("Discard"));

    expect(fieldValue(fieldByLabel("Item"))).toBe(BAYERN_ITEM);
    expect(screen.queryByTestId("save-bar")).toBeNull();
    expect(stubs.media.photo?.discardToken).toBe(1);
    expect(stubs.media.video?.discardToken).toBe(1);
  });

  it("copies the saved code from the button beside the code field", async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);

    await renderForm(editProps());

    const copy = element(
      's-section[heading="Certificate"] s-grid > s-button[accessibilityLabel="Copy code"]',
    );

    expect(copy.getAttribute("icon")).toBe("clipboard");
    expect(
      element("s-page").querySelector('[slot] s-button[icon="clipboard"]'),
    ).toBeNull();

    await act(async () => {
      fireEvent.click(copy);
    });

    expect(writeText).toHaveBeenCalledWith(BAYERN_CODE);
    expect(shopify.toast.show).toHaveBeenCalledWith("Code copied");
  });

  it("offers Duplicate and Delete in the header", async () => {
    await renderForm(editProps());

    const duplicate = byText('s-button[slot="secondary-actions"]', "Duplicate");
    const remove = byText('s-button[slot="secondary-actions"]', "Delete");

    expect(duplicate.getAttribute("href")).toBe(
      `/app/certificates/new?duplicate=${testId(7)}`,
    );
    expect(remove.getAttribute("commandFor")).toBe("delete-certificate-modal");
    expect(remove.getAttribute("command")).toBe("--show");
  });

  it("stays on the page without a toast when the delete fails", async () => {
    serve(inOrder({ ok: false, formError: "unavailable" }));
    await renderForm(editProps());
    const modal = element("s-modal#delete-certificate-modal");
    const hideOverlay = vi.fn();

    Object.assign(modal, { hideOverlay });
    await act(async () => {
      fireEvent.click(
        element('#delete-certificate-modal s-button[slot="primary-action"]'),
      );
    });

    expect(sentTo(`/api/certificates/${testId(7)}`)).toEqual([
      { url: `/api/certificates/${testId(7)}`, body: { intent: "delete" } },
    ]);
    expect(modal.querySelector('s-banner[tone="critical"]')?.textContent).toBe(
      "The certificate couldn't be deleted. Try again.",
    );
    expect(hideOverlay).not.toHaveBeenCalled();
    expect(shopify.toast.show).not.toHaveBeenCalled();
    expect(screen.queryByTestId("page")).toBeNull();
    expect(element("s-page").getAttribute("heading")).toBe(BAYERN_CODE);
  });

  it("deletes the certificate and returns to the last index URL", async () => {
    sessionStorage.setItem(LAST_INDEX_SEARCH_KEY, "?q=bayern");
    serve(inOrder({ ok: true }));
    await renderForm(editProps());
    typeInto(fieldByLabel("Item"), "Bayern Munich Home Shirt 2015-16");
    const modal = element("s-modal#delete-certificate-modal");

    Object.assign(modal, { hideOverlay: vi.fn() });
    fireEvent.click(
      element('#delete-certificate-modal s-button[slot="primary-action"]'),
    );

    expect((await currentPage()).textContent).toBe("/app?q=bayern");
    expect(sentTo(`/api/certificates/${testId(7)}`)).toEqual([
      { url: `/api/certificates/${testId(7)}`, body: { intent: "delete" } },
    ]);
    expect(shopify.toast.show).toHaveBeenCalledWith("Certificate deleted");
    expect(shopify.saveBar.hide).toHaveBeenCalledWith("certificate-save-bar");
    expect(shopify.saveBar.leaveConfirmation).not.toHaveBeenCalled();
  });

  it("completes a processing photo once polling finds it ready", async () => {
    const processing = {
      source: "file" as const,
      fileId: PHOTO_ID,
      url: null,
      previewUrl: null,
    };
    const ready = { ...processing, url: PHOTO_URL };
    const response = deferred<unknown>();
    const readyStatus: MediaStatus = {
      id: PHOTO_ID,
      kind: "photo",
      status: "ready",
      url: PHOTO_URL,
      previewUrl: null,
      errorCode: null,
    };

    serve(() => response.promise);
    await renderForm(
      editProps(
        certificateDetail({
          values: savedValues({ photo: processing }),
          pendingFileIds: [PHOTO_ID],
        }),
      ),
    );
    const polling = () =>
      vi.mocked(useFilePolling).mock.calls.at(-1) as [
        string[],
        FilePollingOptions,
      ];

    expect(polling()[0]).toEqual([PHOTO_ID]);
    expect(polling()[1]).toMatchObject({ kind: "mixed", enabled: true });

    act(() =>
      polling()[1].onStatuses([
        { ...readyStatus, status: "processing", url: null },
      ]),
    );
    act(() => polling()[1].onStatuses([readyStatus]));
    act(() => polling()[1].onStatuses([readyStatus]));
    await act(async () =>
      response.resolve({
        ok: true,
        certificate: certificateDetail({
          values: savedValues({ photo: ready }),
        }),
      }),
    );

    expect(sentTo(`/api/certificates/${testId(7)}`)).toEqual([
      {
        url: `/api/certificates/${testId(7)}`,
        body: { intent: "complete-media" },
      },
    ]);
    expect(polling()[0]).toEqual([]);
    expect(stubs.media.photo?.value).toEqual(ready);
    expect(screen.queryByTestId("save-bar")).toBeNull();
  });

  it("reports proof that failed after the page was left until new media is added", async () => {
    const message = "Shopify couldn't process this file. Try a different file.";

    await renderForm(
      editProps(
        certificateDetail({ mediaErrors: { photo: null, video: message } }),
      ),
    );

    const failure = banner("The proof video couldn't be processed");

    expect(failure.getAttribute("tone")).toBe("critical");
    expect(failure.textContent).toBe(message);

    act(() =>
      stubs.media.video?.onChange({
        source: "url",
        url: "https://example.com/proof.mp4",
      }),
    );

    expect(
      document.querySelector(
        's-banner[heading="The proof video couldn\'t be processed"]',
      ),
    ).toBeNull();
  });
});
