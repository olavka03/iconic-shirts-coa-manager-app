import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { createMemoryRouter, Link, Outlet, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { beginLoading } from "~/shared/utils/admin-loading.utils";
import { useAdminLoading } from "./use-admin-loading.hook";
import { useDebouncedValue } from "./use-debounced-value.hook";
import { useLeaveConfirmation } from "./use-leave-confirmation.hook";
import { deferred } from "../../../tests/helpers/fetch-stub.utils";

describe("useAdminLoading", () => {
  it("shows the admin loading bar while a navigation loads", async () => {
    const load = deferred<null>();
    const router = createMemoryRouter(
      [
        {
          path: "/",
          Component: function Layout() {
            useAdminLoading();

            return <Outlet />;
          },
          children: [
            { path: "a", element: <Link to="/b">Next</Link> },
            { path: "b", loader: () => load.promise, element: <p>Page B</p> },
          ],
        },
      ],
      { initialEntries: ["/a"] },
    );
    render(<RouterProvider router={router} />);
    expect(shopify.loading).not.toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole("link", { name: "Next" }));
    await waitFor(() => expect(shopify.loading).toHaveBeenLastCalledWith(true));

    await act(async () => load.resolve(null));
    await screen.findByText("Page B");
    expect(shopify.loading).toHaveBeenLastCalledWith(false);
  });

  it("keeps the admin loading bar on for a busy page under an idle layout", async () => {
    const router = createMemoryRouter([
      {
        path: "/",
        Component: function Layout() {
          useAdminLoading();

          return <Outlet />;
        },
        children: [
          {
            index: true,
            Component: function BusyPage() {
              useAdminLoading(true);

              return <p>Busy page</p>;
            },
          },
        ],
      },
    ]);
    render(<RouterProvider router={router} />);

    await screen.findByText("Busy page");
    expect(shopify.loading).toHaveBeenLastCalledWith(true);
    expect(shopify.loading).not.toHaveBeenCalledWith(false);
  });

  it("keeps the admin loading bar on through a finished navigation until a request ends", async () => {
    const load = deferred<null>();
    const router = createMemoryRouter(
      [
        {
          path: "/",
          Component: function Layout() {
            useAdminLoading();

            return <Outlet />;
          },
          children: [
            { path: "a", element: <Link to="/b">Next</Link> },
            { path: "b", loader: () => load.promise, element: <p>Page B</p> },
          ],
        },
      ],
      { initialEntries: ["/a"] },
    );
    render(<RouterProvider router={router} />);
    const endRequest = beginLoading();

    fireEvent.click(screen.getByRole("link", { name: "Next" }));
    await waitFor(() => expect(router.state.navigation.state).toBe("loading"));
    await act(async () => load.resolve(null));
    await screen.findByText("Page B");
    expect(shopify.loading).not.toHaveBeenCalledWith(false);

    endRequest();
    expect(shopify.loading).toHaveBeenLastCalledWith(false);
  });

  it("shows the admin loading bar while the extra busy flag is set", async () => {
    function Probe() {
      const [busy, setBusy] = useState(true);
      useAdminLoading(busy);

      return (
        <button type="button" onClick={() => setBusy(false)}>
          Done
        </button>
      );
    }
    const router = createMemoryRouter([{ path: "/", Component: Probe }]);
    render(<RouterProvider router={router} />);
    await waitFor(() => expect(shopify.loading).toHaveBeenLastCalledWith(true));

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(shopify.loading).toHaveBeenLastCalledWith(false);
  });
});

describe("useDebouncedValue", () => {
  it("keeps the previous value until 300 ms pass without a change", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: "a" } },
    );
    expect(result.current).toBe("a");

    rerender({ value: "ab" });
    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe("a");

    rerender({ value: "abc" });
    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe("a");

    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe("abc");
  });
});

describe("useLeaveConfirmation", () => {
  function setup(initialDirty: boolean) {
    function PageA() {
      const [dirty, setDirty] = useState(initialDirty);
      const { allowNext } = useLeaveConfirmation(dirty);

      return (
        <>
          <p>Page A</p>
          <Link to="/b?view=grid">Go to B</Link>
          <Link to="/a">Reload A</Link>
          <Link to="/a#notes">Jump to notes</Link>
          <button type="button" onClick={() => setDirty(true)}>
            Edit
          </button>
          <button type="button" onClick={allowNext}>
            Allow
          </button>
        </>
      );
    }
    const router = createMemoryRouter(
      [
        { path: "/a", Component: PageA },
        { path: "/b", element: <p>Page B</p> },
      ],
      { initialEntries: ["/a"] },
    );
    render(<RouterProvider router={router} />);

    return router;
  }

  it("asks before leaving a dirty page and leaves once the merchant confirms", async () => {
    const confirm = deferred<void>();
    vi.mocked(shopify.saveBar.leaveConfirmation).mockImplementation(
      () => confirm.promise,
    );
    const router = setup(true);

    fireEvent.click(screen.getByRole("link", { name: "Go to B" }));
    await waitFor(() =>
      expect(shopify.saveBar.leaveConfirmation).toHaveBeenCalledTimes(1),
    );
    expect(router.state.location.pathname).toBe("/a");
    expect(screen.getByText("Page A")).toBeTruthy();

    await act(async () => confirm.resolve());
    await screen.findByText("Page B");
    expect(router.state.location.pathname).toBe("/b");
    expect(router.state.location.search).toBe("?view=grid");
    expect(shopify.saveBar.leaveConfirmation).toHaveBeenCalledTimes(1);
  });

  it("stays on the page while the merchant hasn't confirmed", async () => {
    vi.mocked(shopify.saveBar.leaveConfirmation).mockImplementation(
      () => new Promise<void>(() => undefined),
    );
    const router = setup(true);

    fireEvent.click(screen.getByRole("link", { name: "Go to B" }));
    await waitFor(() =>
      expect(shopify.saveBar.leaveConfirmation).toHaveBeenCalledTimes(1),
    );

    expect(router.state.location.pathname).toBe("/a");
    expect(router.state.navigation.state).toBe("idle");
    expect(
      [...router.state.blockers.values()].map((blocker) => blocker.state),
    ).toEqual(["unblocked"]);
  });

  it("lets the next navigation through without asking after allowNext", async () => {
    const router = setup(true);

    fireEvent.click(screen.getByRole("button", { name: "Allow" }));
    fireEvent.click(screen.getByRole("link", { name: "Go to B" }));

    await screen.findByText("Page B");
    expect(router.state.location.pathname).toBe("/b");
    expect(shopify.saveBar.leaveConfirmation).not.toHaveBeenCalled();
  });

  it("asks again when the page becomes dirty after allowNext", async () => {
    vi.mocked(shopify.saveBar.leaveConfirmation).mockImplementation(
      () => new Promise<void>(() => undefined),
    );
    const router = setup(false);

    fireEvent.click(screen.getByRole("button", { name: "Allow" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("link", { name: "Go to B" }));

    await waitFor(() =>
      expect(shopify.saveBar.leaveConfirmation).toHaveBeenCalledTimes(1),
    );
    expect(router.state.location.pathname).toBe("/a");
  });

  it("doesn't ask on a dirty page for a same-URL or hash-only link", async () => {
    const router = setup(true);
    const firstKey = router.state.location.key;

    fireEvent.click(screen.getByRole("link", { name: "Reload A" }));
    await waitFor(() => expect(router.state.location.key).not.toBe(firstKey));
    fireEvent.click(screen.getByRole("link", { name: "Jump to notes" }));
    await waitFor(() => expect(router.state.location.hash).toBe("#notes"));

    expect(router.state.location.pathname).toBe("/a");
    expect(shopify.saveBar.leaveConfirmation).not.toHaveBeenCalled();
  });

  it("navigates from a clean page without asking", async () => {
    const router = setup(false);

    fireEvent.click(screen.getByRole("link", { name: "Go to B" }));

    await screen.findByText("Page B");
    expect(router.state.location.pathname).toBe("/b");
    expect(shopify.saveBar.leaveConfirmation).not.toHaveBeenCalled();
  });
});
