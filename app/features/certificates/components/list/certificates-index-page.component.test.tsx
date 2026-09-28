import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  createRoutesStub,
  useLoaderData,
  useLocation,
  useNavigate,
  useNavigationType,
  type LoaderFunctionArgs,
} from "react-router";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CertificateListItem } from "~/features/certificates/types/certificates.types";
import { parseListParams } from "~/features/certificates/utils/list-params.utils";
import {
  CertificatesIndexPage,
  type IndexData,
} from "./certificates-index-page.component";
import {
  deferred,
  jsonResponse,
  stubFetch,
} from "../../../../../tests/helpers/fetch-stub.utils";
import { testId } from "../../../../../tests/helpers/test-ids.utils";

const ROWS: CertificateListItem[] = [
  {
    id: testId(1),
    code: "IS141816PMM",
    item: "AC Milan Home Shirt 1994-95",
    signedBy: "Paolo Maldini",
    dateLabel: "19 Mar 2025",
    proofLabel: "Photo and video",
    mediaFailed: null,
    orderName: "#141816",
    imageUrl: "https://cdn.shopify.com/s/files/1/0001/files/maldini.jpg",
  },
  {
    id: testId(2),
    code: "IS141909TH",
    item: "Arsenal Away Shirt 2003-04",
    signedBy: "Thierry Henry and 13 more",
    dateLabel: "",
    proofLabel: "",
    mediaFailed: null,
    orderName: null,
    imageUrl: null,
  },
  {
    id: testId(3),
    code: "IS141060-TKRM",
    item: "Tottenham Home Shirt 2019-20",
    signedBy: "Harry Kane",
    dateLabel: "Apr 2026",
    proofLabel: "Photo only",
    mediaFailed: "photo",
    orderName: "#141060",
    imageUrl: null,
  },
  {
    id: testId(4),
    code: "IS141458PSRG",
    item: "Manchester United Home Shirt 1999",
    signedBy: "Paul Scholes and Ryan Giggs",
    dateLabel: "Oct 2019–Mar 2022",
    proofLabel: "Video only",
    mediaFailed: "video",
    orderName: "#141458",
    imageUrl: null,
  },
  {
    id: testId(5),
    code: "IS141950AG",
    item: "Real Madrid Home Shirt 2024-25",
    signedBy: "Arda Güler",
    dateLabel: "2 Jun 2025",
    proofLabel: "Photo and video",
    mediaFailed: "both",
    orderName: "#141950",
    imageUrl: null,
  },
];

type LoaderScenario = Partial<Omit<IndexData, "params" | "page">> & {
  page?: (requested: number) => number;
  holdLoad?: (search: string) => Promise<void> | undefined;
};

// Like the AppProvider: polaris.js turns a click on an in-app href into shopify:navigate.
function LocationProbe() {
  const location = useLocation();
  const type = useNavigationType();
  const navigate = useNavigate();

  useEffect(() => {
    const follow = (event: Event) => {
      const href = (event.target as HTMLElement).getAttribute("href");

      if (href) {
        navigate(href);
      }
    };

    document.addEventListener("shopify:navigate", follow);

    return () => document.removeEventListener("shopify:navigate", follow);
  }, [navigate]);

  return (
    <output data-testid="location" data-type={type}>
      {location.search}
    </output>
  );
}

function renderIndex(url = "/app", scenario: LoaderScenario = {}) {
  const {
    page = (requested: number) => requested,
    holdLoad = () => undefined,
    ...data
  } = scenario;
  const loader = vi.fn(
    async ({ request }: LoaderFunctionArgs): Promise<IndexData> => {
      const requestUrl = new URL(request.url);
      await holdLoad(requestUrl.search);
      const params = parseListParams(requestUrl.searchParams);

      return {
        rows: ROWS,
        total: ROWS.length,
        pageCount: 1,
        storeIsEmpty: false,
        ...data,
        params,
        page: page(params.page),
      };
    },
  );

  function IndexRoute() {
    return (
      <>
        <CertificatesIndexPage {...useLoaderData<IndexData>()} />
        <LocationProbe />
      </>
    );
  }

  const RoutesStub = createRoutesStub([
    {
      path: "/app",
      loader,
      Component: IndexRoute,
      HydrateFallback: () => null,
    },
  ]);
  const view = render(<RoutesStub initialEntries={[url]} />);

  return { ...view, loader };
}

async function ready() {
  await screen.findByTestId("location");
}

// Lets a pending navigation run its loader and commit, without letting 300 ms pass.
async function settle() {
  for (let attempt = 0; attempt < 10; attempt++) {
    await act(async () => {});
  }
}

function search(): string {
  return screen.getByTestId("location").textContent ?? "";
}

function navigationType(): string | null {
  return screen.getByTestId("location").getAttribute("data-type");
}

function query<QueriedElement extends Element = HTMLElement>(
  selector: string,
): QueriedElement {
  const element = document.querySelector<QueriedElement>(selector);

  if (!element) {
    throw new Error(`Nothing matches ${selector}`);
  }

  return element;
}

function all(selector: string): Element[] {
  return [...document.querySelectorAll(selector)];
}

function byText(selector: string, text: string): Element {
  const match = all(selector).find(
    (element) => element.textContent?.trim() === text,
  );

  if (!match) {
    throw new Error(`No ${selector} reads "${text}"`);
  }

  return match;
}

function setValue(element: Element, value: string) {
  Object.assign(element, { value });
  fireEvent.input(element);
}

function choose(element: Element, value: string) {
  Object.assign(element, { values: [value] });
  fireEvent.input(element);
}

function rowCheckbox(code: string): Element {
  return query(`s-checkbox[accessibilityLabel="Select ${code}"]`);
}

function headerCheckbox(): Element {
  return query(
    's-checkbox[accessibilityLabel="Select all certificates on this page"]',
  );
}

function bulkModal() {
  const modal = query("s-modal#bulk-delete-modal");
  const hideOverlay = vi.fn();
  Object.assign(modal, { hideOverlay });

  return { modal, hideOverlay };
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("empty store", () => {
  it("shows the first certificate empty state instead of the table", async () => {
    renderIndex("/app", { rows: [], total: 0, storeIsEmpty: true });
    await ready();

    const empty = query("s-empty-state");

    expect(empty.getAttribute("heading")).toBe("Create your first certificate");
    expect(query('s-section[accessibilityLabel="No certificates yet"]')).toBe(
      empty.parentElement,
    );
    expect(
      query('s-empty-state s-button[slot="primary-action"]').getAttribute(
        "href",
      ),
    ).toBe("/app/certificates/new");
    expect(all("s-table")).toHaveLength(0);
    expect(
      byText('s-page > s-button[slot="primary-action"]', "Create certificate"),
    ).toBeTruthy();
  });
});

describe("table", () => {
  it("renders one row per certificate with a delegated link", async () => {
    renderIndex();
    await ready();

    const rows = all("s-table-body s-table-row");

    expect(rows).toHaveLength(ROWS.length);
    expect(rows[0].getAttribute("clickDelegate")).toBe(
      `certificate-link-${testId(1)}`,
    );

    const link = query(`s-link#certificate-link-${testId(1)}`);

    expect(link.getAttribute("href")).toBe(`/app/certificates/${testId(1)}`);
    expect(link.textContent).toBe("IS141816PMM");
    expect(rows[0].querySelector("s-thumbnail")!.getAttribute("src")).toBe(
      "https://cdn.shopify.com/s/files/1/0001/files/maldini.jpg?width=80",
    );
  });

  it("shows a dash for empty cells", async () => {
    renderIndex();
    await ready();

    const cells = [
      ...all("s-table-body s-table-row")[1].querySelectorAll("s-table-cell"),
    ].map((cell) => cell.textContent);

    expect(cells.slice(1)).toEqual([
      "Thierry Henry and 13 more",
      "Arsenal Away Shirt 2003-04",
      "—",
      "—",
      "—",
    ]);
  });

  it("puts a failure badge after the proof text", async () => {
    renderIndex();
    await ready();

    const proof = (index: number) =>
      all("s-table-body s-table-row")[index].querySelectorAll(
        "s-table-cell",
      )[4];

    expect(proof(0).querySelector("s-badge")).toBeNull();
    expect(proof(2).textContent).toBe("Photo onlyPhoto failed");
    expect(proof(3).textContent).toBe("Video onlyVideo failed");
    expect(proof(4).textContent).toBe("Photo and videoPhoto and video failed");
    expect(proof(4).querySelector("s-badge")!.getAttribute("tone")).toBe(
      "critical",
    );
  });

  it("shows the range and page links under the table", async () => {
    renderIndex("/app?q=henry&page=2&perPage=10", {
      pageCount: 20,
      total: 200,
    });
    await ready();

    const pageButtons = all("s-button").filter((button) =>
      button.getAttribute("accessibilityLabel")?.startsWith("Page "),
    );
    const current = pageButtons[1];

    expect(query("s-table").hasAttribute("paginate")).toBe(false);
    expect(current.closest("s-grid")!.getAttribute("gridTemplateColumns")).toBe(
      "1fr auto 1fr",
    );
    expect(byText("s-text", "11–20 of 200")).toBeTruthy();
    expect(
      pageButtons.map((button) => button.getAttribute("accessibilityLabel")),
    ).toEqual([
      "Page 1",
      "Page 2, current page",
      "Page 3",
      "Page 4",
      "Page 5",
      "Page 20",
    ]);
    expect(current.getAttribute("variant")).toBe("primary");
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(pageButtons[0].getAttribute("href")).toBe("/app?q=henry&perPage=10");
    expect(pageButtons[5].getAttribute("href")).toBe(
      "/app?q=henry&page=20&perPage=10",
    );
    expect(query('span[aria-hidden="true"]').textContent).toBe("…");
    expect(byText("s-text", "Page 2 of 20")).toBeTruthy();
    expect(
      query('s-button[accessibilityLabel="Next page"]').getAttribute("href"),
    ).toBe("/app?q=henry&page=3&perPage=10");
    expect(
      query('s-button[accessibilityLabel="Previous page"]').getAttribute(
        "href",
      ),
    ).toBe("/app?q=henry&perPage=10");
  });

  it("keeps the table loading while the next page loads", async () => {
    const next = deferred<void>();

    renderIndex("/app", {
      pageCount: 3,
      holdLoad: (search) => (search === "?page=2" ? next.promise : undefined),
    });
    await ready();

    act(() => {
      query('s-button[accessibilityLabel="Next page"]').dispatchEvent(
        new Event("shopify:navigate", { bubbles: true }),
      );
    });

    await waitFor(() =>
      expect(query("s-table").hasAttribute("loading")).toBe(true),
    );

    await act(async () => next.resolve());

    await waitFor(() => expect(search()).toBe("?page=2"));
    expect(query("s-table").hasAttribute("loading")).toBe(false);
  });

  it("shows only the range when everything fits on one page", async () => {
    renderIndex("/app", { pageCount: 1 });
    await ready();

    expect(byText("s-text", `1–${ROWS.length} of ${ROWS.length}`)).toBeTruthy();
    expect(all('s-button[accessibilityLabel="Next page"]')).toHaveLength(0);
  });

  it("replaces a page the loader clamped", async () => {
    const { loader } = renderIndex("/app?page=9", {
      pageCount: 2,
      page: (requested) => Math.min(requested, 2),
    });

    await waitFor(() => expect(search()).toBe("?page=2"));
    expect(navigationType()).toBe("REPLACE");
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
  });
});

describe("search", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      shouldAdvanceTime: true,
      toFake: ["setTimeout", "clearTimeout"],
    });
  });

  it("applies the search 300 ms after typing stops", async () => {
    renderIndex();
    await ready();

    const field = query("s-search-field");
    field.focus();
    setValue(field, "hen");
    act(() => {
      vi.advanceTimersByTime(299);
    });
    await settle();

    expect(search()).toBe("");

    act(() => {
      vi.advanceTimersByTime(1);
    });

    await waitFor(() => expect(search()).toBe("?q=hen"));
    expect(navigationType()).toBe("REPLACE");
  });

  it("applies the search at once on Enter", async () => {
    renderIndex();
    await ready();

    const field = query("s-search-field");
    field.focus();
    setValue(field, "maldini");
    fireEvent.keyDown(field, { key: "Enter" });
    await settle();

    expect(search()).toBe("?q=maldini");
  });

  it("never resets the field while the user keeps typing", async () => {
    renderIndex();
    await ready();

    const field = query<HTMLElement & { value: string }>("s-search-field");
    field.focus();
    setValue(field, "hen");
    act(() => {
      vi.advanceTimersByTime(300);
    });
    setValue(field, "henr");
    await waitFor(() => expect(search()).toBe("?q=hen"));

    expect(field.value).toBe("henr");

    act(() => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => expect(search()).toBe("?q=henr"));
    expect(field.value).toBe("henr");
  });

  it("takes the URL's search after Clear all", async () => {
    renderIndex("/app?q=henry&photo=yes");
    await ready();

    const field = query<HTMLElement & { value: string }>("s-search-field");

    expect(field.getAttribute("value")).toBe("henry");

    fireEvent.click(byText("s-button", "Clear all"));

    await waitFor(() => expect(search()).toBe(""));
    await waitFor(() =>
      expect(query("s-search-field").getAttribute("value")).toBe(""),
    );
  });
});

describe("a change made while another one is still loading", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      shouldAdvanceTime: true,
      toFake: ["setTimeout", "clearTimeout"],
    });
  });

  it("keeps a pending search when a filter is picked", async () => {
    const searchLoad = deferred<void>();
    const { loader } = renderIndex("/app", {
      holdLoad: (search) =>
        search === "?q=henry" ? searchLoad.promise : undefined,
    });
    await ready();

    const field = query<HTMLElement & { value: string }>("s-search-field");
    field.focus();
    setValue(field, "henry");
    act(() => {
      vi.advanceTimersByTime(300);
    });
    await settle();

    expect(loader).toHaveBeenCalledTimes(2);
    expect(search()).toBe("");

    field.blur();
    choose(query('#filter-popover s-choice-list[name="photo"]'), "yes");

    await waitFor(() => expect(search()).toBe("?q=henry&photo=yes"));
    expect(field.value).toBe("henry");
    searchLoad.resolve();
  });

  it("keeps a pending filter when the search applies", async () => {
    const filterLoad = deferred<void>();
    const { loader } = renderIndex("/app", {
      holdLoad: (search) =>
        search === "?photo=yes" ? filterLoad.promise : undefined,
    });
    await ready();

    choose(query('#filter-popover s-choice-list[name="photo"]'), "yes");
    await settle();

    expect(loader).toHaveBeenCalledTimes(2);
    expect(search()).toBe("");

    const field = query("s-search-field");
    field.focus();
    setValue(field, "henry");
    act(() => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => expect(search()).toBe("?q=henry&photo=yes"));
    filterLoad.resolve();
  });
});

describe("selection and bulk delete", () => {
  it("shows the bulk bar and a partial header checkbox for one selected row", async () => {
    renderIndex();
    await ready();

    fireEvent.input(rowCheckbox("IS141816PMM"));

    const bulk = query('s-box[slot="filters"] s-checkbox');

    expect(bulk.getAttribute("label")).toBe("1 selected");
    expect(bulk.hasAttribute("indeterminate")).toBe(true);
    expect(headerCheckbox().hasAttribute("indeterminate")).toBe(true);
    expect(headerCheckbox().hasAttribute("checked")).toBe(false);
    expect(all("s-search-field")).toHaveLength(0);
    expect(
      byText('s-box[slot="filters"] s-button', "Delete").getAttribute(
        "commandFor",
      ),
    ).toBe("bulk-delete-modal");
  });

  it("selects and clears the whole page from the header checkbox", async () => {
    renderIndex();
    await ready();

    fireEvent.input(rowCheckbox("IS141909TH"));
    fireEvent.input(headerCheckbox());

    expect(
      query('s-box[slot="filters"] s-checkbox').getAttribute("label"),
    ).toBe("5 selected");
    expect(headerCheckbox().hasAttribute("checked")).toBe(true);
    expect(headerCheckbox().hasAttribute("indeterminate")).toBe(false);
    expect(rowCheckbox("IS141950AG").hasAttribute("checked")).toBe(true);

    fireEvent.input(headerCheckbox());

    expect(all('s-box[slot="filters"]')).toHaveLength(0);
    expect(all("s-search-field")).toHaveLength(1);
  });

  it("clears the selection when the URL changes", async () => {
    renderIndex("/app", { pageCount: 2 });
    await ready();

    fireEvent.input(rowCheckbox("IS141816PMM"));

    act(() => {
      query('s-button[accessibilityLabel="Next page"]').dispatchEvent(
        new Event("shopify:navigate", { bubbles: true }),
      );
    });

    await waitFor(() => expect(search()).toBe("?page=2"));
    expect(navigationType()).toBe("PUSH");
    expect(all('s-box[slot="filters"]')).toHaveLength(0);
    expect(rowCheckbox("IS141816PMM").hasAttribute("checked")).toBe(false);
  });

  it("deletes the selected certificates, then revalidates", async () => {
    const fetchMock = stubFetch(async () =>
      jsonResponse({
        ok: true,
        deleted: [
          { id: testId(1), code: "IS141816PMM" },
          { id: testId(2), code: "IS141909TH" },
        ],
      }),
    );
    const { loader } = renderIndex();
    await ready();

    fireEvent.input(rowCheckbox("IS141816PMM"));
    fireEvent.input(rowCheckbox("IS141909TH"));

    const { modal, hideOverlay } = bulkModal();

    expect(modal.getAttribute("heading")).toBe("Delete 2 certificates?");

    await act(async () => {
      fireEvent.click(
        query('#bulk-delete-modal s-button[slot="primary-action"]'),
      );
    });

    const [url, requestInit] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];

    expect(url).toBe("/api/certificates");
    expect(requestInit.method).toBe("POST");
    expect(JSON.parse(String(requestInit.body))).toEqual({
      intent: "delete",
      ids: [testId(1), testId(2)],
    });
    expect(shopify.toast.show).toHaveBeenCalledWith("2 certificates deleted");
    expect(hideOverlay).toHaveBeenCalledTimes(1);
    expect(all('s-box[slot="filters"]')).toHaveLength(0);
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
  });

  it("says one certificate was deleted", async () => {
    stubFetch(async () =>
      jsonResponse({
        ok: true,
        deleted: [{ id: testId(1), code: "IS141816PMM" }],
      }),
    );
    renderIndex();
    await ready();

    fireEvent.input(rowCheckbox("IS141816PMM"));
    bulkModal();
    await act(async () => {
      fireEvent.click(
        query('#bulk-delete-modal s-button[slot="primary-action"]'),
      );
    });

    expect(shopify.toast.show).toHaveBeenCalledWith("Certificate deleted");
  });

  it("says the certificates were already deleted when none were left to delete", async () => {
    stubFetch(async () => jsonResponse({ ok: true, deleted: [] }));
    renderIndex();
    await ready();

    fireEvent.input(rowCheckbox("IS141816PMM"));
    bulkModal();
    await act(async () => {
      fireEvent.click(
        query('#bulk-delete-modal s-button[slot="primary-action"]'),
      );
    });

    expect(shopify.toast.show).toHaveBeenCalledWith(
      "Certificates already deleted",
    );
  });

  it("shows the table loading with the old rows while it refreshes after a delete", async () => {
    stubFetch(async () =>
      jsonResponse({
        ok: true,
        deleted: [{ id: testId(1), code: "IS141816PMM" }],
      }),
    );
    const refresh = deferred<void>();
    const holdLoad = vi
      .fn<(search: string) => Promise<void> | undefined>()
      .mockReturnValueOnce(undefined)
      .mockReturnValue(refresh.promise);
    renderIndex("/app", { holdLoad });
    await ready();

    fireEvent.input(rowCheckbox("IS141816PMM"));
    bulkModal();
    await act(async () => {
      fireEvent.click(
        query('#bulk-delete-modal s-button[slot="primary-action"]'),
      );
    });

    await waitFor(() =>
      expect(query("s-table").hasAttribute("loading")).toBe(true),
    );
    expect(all("s-table-body s-table-row")).toHaveLength(ROWS.length);
    expect(shopify.loading).toHaveBeenLastCalledWith(true);

    await act(async () => refresh.resolve());

    await waitFor(() =>
      expect(query("s-table").hasAttribute("loading")).toBe(false),
    );
    expect(all("s-table-body s-table-row")).toHaveLength(ROWS.length);
    expect(shopify.loading).toHaveBeenLastCalledWith(false);
  });

  it("keeps the modal and the selection when the delete fails", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    const { loader } = renderIndex();
    await ready();

    fireEvent.input(rowCheckbox("IS141816PMM"));
    fireEvent.input(rowCheckbox("IS141909TH"));

    const { modal, hideOverlay } = bulkModal();

    await act(async () => {
      fireEvent.click(
        query('#bulk-delete-modal s-button[slot="primary-action"]'),
      );
    });

    expect(modal.querySelector("s-banner")!.textContent).toBe(
      "The certificates couldn't be deleted. Try again.",
    );
    expect(hideOverlay).not.toHaveBeenCalled();
    expect(shopify.toast.show).not.toHaveBeenCalled();
    expect(
      query('s-box[slot="filters"] s-checkbox').getAttribute("label"),
    ).toBe("2 selected");
    expect(loader).toHaveBeenCalledTimes(1);
  });
});

describe("grid", () => {
  it("switches to the grid in place", async () => {
    renderIndex("/app?sort=code");
    await ready();

    const table = byText("s-press-button", "Table");

    expect(table.hasAttribute("pressed")).toBe(true);
    expect(byText("s-press-button", "Grid").hasAttribute("pressed")).toBe(
      false,
    );
    expect(
      query('s-button-group[accessibilityLabel="View"]').getAttribute("gap"),
    ).toBe("none");

    fireEvent.click(byText("s-press-button", "Grid"));

    await waitFor(() => expect(search()).toBe("?sort=code&view=grid"));
    expect(navigationType()).toBe("REPLACE");
    expect(all("s-table")).toHaveLength(0);
    expect(byText("s-press-button", "Grid").hasAttribute("pressed")).toBe(true);

    const card = query(`s-clickable[href="/app/certificates/${testId(1)}"]`);

    expect(card.getAttribute("accessibilityLabel")).toBe(
      "Open certificate IS141816PMM",
    );
    expect(card.querySelector("s-image")!.getAttribute("src")).toBe(
      "https://cdn.shopify.com/s/files/1/0001/files/maldini.jpg?width=400",
    );
    expect(card.querySelector("s-heading")!.textContent).toBe("IS141816PMM");
    expect(card.querySelector("s-heading")!.getAttribute("fontSize")).toBe(
      "base",
    );
    expect(all("s-clickable")).toHaveLength(ROWS.length);
    expect(card.closest("s-grid")!.getAttribute("gridTemplateColumns")).toBe(
      "@container (inline-size > 560px) 1fr 1fr 1fr 1fr, (inline-size > 900px) 1fr 1fr 1fr 1fr 1fr, (inline-size > 1200px) 1fr 1fr 1fr 1fr 1fr 1fr, 1fr 1fr 1fr",
    );
  });

  it("uses the placeholder for a missing or broken photo", async () => {
    renderIndex("/app?view=grid");
    await ready();

    const image = (id: string) =>
      query(`s-clickable[href="/app/certificates/${id}"] s-image`);

    expect(image(testId(2)).getAttribute("src")).toBe("/images/no-photo.svg");

    act(() => {
      image(testId(1)).dispatchEvent(new Event("error"));
    });

    expect(image(testId(1)).getAttribute("src")).toBe("/images/no-photo.svg");
  });

  it("links pagination to absolute app URLs", async () => {
    renderIndex("/app?view=grid&q=henry", { pageCount: 3 });
    await ready();

    const previous = query('s-button[accessibilityLabel="Previous page"]');
    const next = query('s-button[accessibilityLabel="Next page"]');

    expect(previous.hasAttribute("disabled")).toBe(true);
    expect(next.hasAttribute("disabled")).toBe(false);
    expect(next.getAttribute("href")).toBe("/app?q=henry&view=grid&page=2");
  });

  it("disables the next page on the last page", async () => {
    renderIndex("/app?view=grid&page=3", { pageCount: 3 });
    await ready();

    expect(
      query('s-button[accessibilityLabel="Previous page"]').getAttribute(
        "href",
      ),
    ).toBe("/app?view=grid&page=2");
    expect(
      query('s-button[accessibilityLabel="Next page"]').hasAttribute(
        "disabled",
      ),
    ).toBe(true);
  });
});

describe("filters", () => {
  it("drops a filter when its chip is removed", async () => {
    renderIndex("/app?photo=yes&video=no");
    await ready();

    const chip = byText("s-clickable-chip", "Has photo");

    expect(chip.getAttribute("accessibilityLabel")).toBe("Remove photo filter");
    expect(chip.getAttribute("commandFor")).toBe("filter-popover");

    act(() => {
      chip.dispatchEvent(new Event("remove"));
    });

    await waitFor(() => expect(search()).toBe("?video=no"));
    expect(all("s-clickable-chip").map((chip) => chip.textContent)).toEqual([
      "No video",
    ]);
  });

  it("clears search and filters but keeps sort and view", async () => {
    renderIndex(
      "/app?q=henry&photo=yes&signedFrom=2025-03-01&sort=code&view=grid",
    );
    await ready();

    expect(byText("s-text", "5 certificates")).toBeTruthy();
    expect(
      byText("s-clickable-chip", "Date signed: from 1 Mar 2025"),
    ).toBeTruthy();

    fireEvent.click(byText("s-button", "Clear all"));

    await waitFor(() => expect(search()).toBe("?sort=code&view=grid"));
    expect(all("s-clickable-chip")).toHaveLength(0);
  });

  it("applies a photo filter from the popover", async () => {
    renderIndex("/app?page=2", { pageCount: 2 });
    await ready();

    const photo = query('#filter-popover s-choice-list[name="photo"]');

    expect(byText("s-choice", "Any").hasAttribute("selected")).toBe(true);
    expect(
      query('s-button[accessibilityLabel="Filter"]').getAttribute("icon"),
    ).toBe("filter");

    choose(photo, "no");

    await waitFor(() => expect(search()).toBe("?photo=no"));
    expect(
      query('s-button[accessibilityLabel="Filter"]').getAttribute("icon"),
    ).toBe("filter-active");

    choose(photo, "any");

    await waitFor(() => expect(search()).toBe(""));
  });

  it("switches the sort to its natural direction", async () => {
    renderIndex();
    await ready();

    choose(query('#sort-popover s-choice-list[name="sort"]'), "code");

    await waitFor(() => expect(search()).toBe("?sort=code"));
    expect(
      all('#sort-popover s-choice-list[name="dir"] s-choice').map(
        (choice) => choice.textContent,
      ),
    ).toEqual(["A–Z", "Z–A"]);

    choose(query('#sort-popover s-choice-list[name="dir"]'), "desc");

    await waitFor(() => expect(search()).toBe("?sort=code&dir=desc"));
  });

  it("applies a date range and rejects an end before the start", async () => {
    renderIndex();
    await ready();

    const dateField = (label: string) =>
      query(`#filter-popover s-date-field[label="${label}"]`);

    expect(query("#filter-popover").hasAttribute("inlineSize")).toBe(false);
    expect(dateField("Signed from").parentElement).toBe(
      dateField("Signed to").parentElement,
    );
    expect(dateField("Signed from").parentElement!.tagName).toBe("S-STACK");

    setValue(dateField("Signed from"), "2025-03-10");

    await waitFor(() => expect(search()).toBe("?signedFrom=2025-03-10"));

    setValue(dateField("Signed to"), "2025-03-01");
    await settle();

    expect(dateField("Signed to").getAttribute("error")).toBe(
      "End date can't be before the start date.",
    );
    expect(search()).toBe("?signedFrom=2025-03-10");

    setValue(dateField("Signed to"), "2025-03-31");

    await waitFor(() =>
      expect(search()).toBe("?signedFrom=2025-03-10&signedTo=2025-03-31"),
    );
    expect(dateField("Signed to").hasAttribute("error")).toBe(false);
  });

  it("applies a date picked in the calendar, waits for a full typed date, and clears a bound", async () => {
    renderIndex("/app?page=3", { pageCount: 5 });
    await ready();

    const dateField = (label: string) =>
      query(`#filter-popover s-date-field[label="${label}"]`);
    const pick = (label: string, value: string) => {
      Object.assign(dateField(label), { value });
      fireEvent.change(dateField(label));
    };

    pick("Signed from", "2025-03-10");

    await waitFor(() => expect(search()).toBe("?signedFrom=2025-03-10"));
    expect(navigationType()).toBe("REPLACE");
    expect(
      byText("s-clickable-chip", "Date signed: from 10 Mar 2025"),
    ).toBeTruthy();

    setValue(dateField("Signed to"), "2025-03");
    await settle();

    expect(search()).toBe("?signedFrom=2025-03-10");

    setValue(dateField("Signed to"), "2025-03-31");

    await waitFor(() =>
      expect(search()).toBe("?signedFrom=2025-03-10&signedTo=2025-03-31"),
    );

    pick("Signed from", "");

    await waitFor(() => expect(search()).toBe("?signedTo=2025-03-31"));
    expect(
      byText("s-clickable-chip", "Date signed: until 31 Mar 2025"),
    ).toBeTruthy();
  });

  it("limits the date fields to today and earlier", async () => {
    renderIndex();
    await ready();

    await waitFor(() =>
      expect(
        query('s-date-field[label="Signed from"]').getAttribute("allow"),
      ).toMatch(/^--\d{4}-\d{2}-\d{2}$/),
    );
  });
});

describe("no results", () => {
  it.each([
    ["/app?q=zzz", "Clear search", ""],
    ["/app?video=yes&sort=code", "Clear filters", "?sort=code"],
    ["/app?q=zzz&photo=no", "Clear search and filters", ""],
  ])("offers the right way out for %s", async (url, label, after) => {
    renderIndex(url, { rows: [], total: 0 });
    await ready();

    const empty = query("s-table-body s-empty-state");

    expect(empty.getAttribute("heading")).toBe("No certificates found");
    expect(empty.querySelector('s-text[slot="subheading"]')!.textContent).toBe(
      "Try changing the search or filters.",
    );

    const action = query(
      's-table-body s-empty-state s-button[slot="secondary-actions"]',
    );

    expect(action.textContent).toBe(label);

    fireEvent.click(action);

    await waitFor(() => expect(search()).toBe(after));
  });
});

describe("last index search", () => {
  it("remembers the current search for the breadcrumb", async () => {
    renderIndex("/app?q=henry&view=grid");
    await ready();

    await waitFor(() =>
      expect(sessionStorage.getItem("coa:lastIndexSearch")).toBe(
        "?q=henry&view=grid",
      ),
    );

    fireEvent.click(byText("s-button", "Clear all"));

    await waitFor(() =>
      expect(sessionStorage.getItem("coa:lastIndexSearch")).toBe("?view=grid"),
    );
  });
});

describe("page size", () => {
  const perPageSelect = () => query('s-select[label="Per page"]');

  it.each([
    ["table", "/app?page=2", "?perPage=100"],
    ["grid", "/app?view=grid&page=2", "?view=grid&perPage=100"],
  ])(
    "changes the page size from the %s toolbar and goes back to page 1",
    async (_view, url, expected) => {
      renderIndex(url, { pageCount: 3 });
      await ready();

      const select = perPageSelect();
      const filter = query('s-button[accessibilityLabel="Filter"]');
      const controls = filter.parentElement!;
      const toolbar = controls.parentElement!;

      expect(select.parentElement).toBe(controls);
      expect(
        [...controls.children].map((control) => control.tagName.toLowerCase()),
      ).toEqual(["s-button", "s-button", "s-select", "s-button-group"]);
      expect(controls.getAttribute("gridTemplateColumns")).toBe(
        "auto auto 150px auto",
      );
      expect(controls.getAttribute("justifyContent")).toBe("end");
      expect(toolbar.getAttribute("gridTemplateColumns")).toBe(
        "@container (inline-size > 720px) 1fr auto, 1fr",
      );
      expect(toolbar.firstElementChild!.tagName).toBe("S-SEARCH-FIELD");

      expect(select.getAttribute("labelAccessibilityVisibility")).toBe(
        "exclusive",
      );
      expect(select.getAttribute("value")).toBe("25");
      expect(
        all('s-select[label="Per page"] s-option').map(
          (option) => option.textContent,
        ),
      ).toEqual(["10 per page", "25 per page", "50 per page", "100 per page"]);

      Object.assign(select, { value: "100" });
      fireEvent.change(select);

      await waitFor(() => expect(search()).toBe(expected));
    },
  );

  it("keeps the page size in the grid's page links", async () => {
    renderIndex("/app?view=grid&perPage=10", { pageCount: 3 });
    await ready();

    expect(perPageSelect().getAttribute("value")).toBe("10");
    expect(
      query('s-button[accessibilityLabel="Next page"]').getAttribute("href"),
    ).toBe("/app?view=grid&page=2&perPage=10");
  });
});
