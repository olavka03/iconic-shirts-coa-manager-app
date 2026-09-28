import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { createRoutesStub, useLoaderData } from "react-router";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIST_PARAMS,
  parseListParams,
} from "~/features/certificates/utils/list-params.utils";
import { deferred } from "../../../../tests/helpers/fetch-stub.utils";
import type { IndexData } from "./list/certificates-index-page.component";
import {
  StreamedEditForm,
  StreamedIndexPage,
} from "./streamed-pages.component";

const EMPTY_INDEX: IndexData = {
  params: DEFAULT_LIST_PARAMS,
  rows: [],
  total: 0,
  page: 1,
  pageCount: 0,
  storeIsEmpty: true,
};

function renderPage(page: ReactNode) {
  const RoutesStub = createRoutesStub([
    { path: "/app", Component: () => page },
  ]);

  render(<RoutesStub initialEntries={["/app"]} />);
}

describe("streamed pages", () => {
  it("shows the index skeleton at once, then the list", async () => {
    const list = deferred<IndexData>();

    renderPage(<StreamedIndexPage view="grid" list={list.promise} />);

    expect(await screen.findByText("Loading certificates")).toBeTruthy();
    expect(document.querySelector("s-table")).toBeNull();

    await act(async () => list.resolve(EMPTY_INDEX));

    await waitFor(() =>
      expect(screen.queryByText("Loading certificates")).toBeNull(),
    );
    expect(screen.getAllByText("Create certificate").length).toBeGreaterThan(0);
  });

  it("shows the load error page when the list fails", async () => {
    renderPage(
      <StreamedIndexPage
        view="table"
        list={Promise.reject(new Error("database down"))}
      />,
    );

    await waitFor(() =>
      expect(
        document.querySelector(
          's-banner[heading="Certificates couldn\'t be loaded"]',
        ),
      ).not.toBeNull(),
    );
  });

  it("shows the certificate skeleton at once, then Not found for a missing certificate", async () => {
    const form = deferred<null>();

    renderPage(<StreamedEditForm form={form.promise} />);

    expect(await screen.findByText("Loading certificate")).toBeTruthy();

    await act(async () => form.resolve(null));

    await waitFor(() =>
      expect(
        document.querySelector('s-page[heading="Certificate not found"]'),
      ).not.toBeNull(),
    );
  });

  it("shows the load error page when the certificate fails", async () => {
    renderPage(<StreamedEditForm form={Promise.reject(new Error("down"))} />);

    await waitFor(() =>
      expect(
        document.querySelector(
          's-banner[heading="This certificate couldn\'t be loaded"]',
        ),
      ).not.toBeNull(),
    );
  });

  it("keeps the revealed list with the table loading while a filter change loads", async () => {
    const pending = deferred<IndexData>();
    const lists: Promise<IndexData>[] = [];

    function IndexRoute() {
      const { params, list } = useLoaderData<{
        params: IndexData["params"];
        list: Promise<IndexData>;
      }>();

      return <StreamedIndexPage view={params.view} list={list} />;
    }

    const RoutesStub = createRoutesStub([
      {
        path: "/app",
        Component: IndexRoute,
        HydrateFallback: () => null,
        loader: ({ request }) => {
          const params = parseListParams(new URL(request.url).searchParams);
          const list =
            lists.length === 0
              ? Promise.resolve({ ...EMPTY_INDEX, params, storeIsEmpty: false })
              : pending.promise;

          lists.push(list);

          return { params, list };
        },
      },
    ]);

    render(<RoutesStub initialEntries={["/app"]} />);

    await waitFor(() =>
      expect(document.querySelector("s-table")).not.toBeNull(),
    );

    const select = document.querySelector('s-select[label="Per page"]')!;

    Object.assign(select, { value: "50" });
    fireEvent.change(select);

    await waitFor(() => expect(lists).toHaveLength(2));
    await waitFor(() =>
      expect(document.querySelector("s-table")!.hasAttribute("loading")).toBe(
        true,
      ),
    );
    expect(screen.queryByText("Loading certificates")).toBeNull();

    await act(async () =>
      pending.resolve({
        ...EMPTY_INDEX,
        params: { ...DEFAULT_LIST_PARAMS, perPage: 50 },
        storeIsEmpty: false,
      }),
    );

    await waitFor(() =>
      expect(document.querySelector("s-table")!.hasAttribute("loading")).toBe(
        false,
      ),
    );
    expect(screen.queryByText("Loading certificates")).toBeNull();
  });
});
