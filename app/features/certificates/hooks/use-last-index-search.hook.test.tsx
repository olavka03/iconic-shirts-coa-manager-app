import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LAST_INDEX_SEARCH_KEY,
  readLastIndexSearch,
  useLastIndexHref,
  writeLastIndexSearch,
} from "./use-last-index-search.hook";

describe("last index search", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  function Breadcrumb({ seen }: { seen: string[] }) {
    const href = useLastIndexHref();
    seen.push(href);

    return <a href={href}>Certificates</a>;
  }

  it("reads back the query the index wrote", () => {
    writeLastIndexSearch("?q=x&sort=code");

    expect(sessionStorage.getItem(LAST_INDEX_SEARCH_KEY)).toBe(
      "?q=x&sort=code",
    );
    expect(readLastIndexSearch()).toBe("?q=x&sort=code");
  });

  it("reads an empty string when nothing was stored", () => {
    expect(readLastIndexSearch()).toBe("");
  });

  it("reads an empty string when session storage throws", () => {
    vi.spyOn(sessionStorage, "getItem").mockImplementation(() => {
      throw new DOMException("Access denied", "SecurityError");
    });

    expect(readLastIndexSearch()).toBe("");
  });

  it("ignores a stored value that isn't a query string", () => {
    sessionStorage.setItem(LAST_INDEX_SEARCH_KEY, "q=x");
    expect(readLastIndexSearch()).toBe("");

    sessionStorage.setItem(LAST_INDEX_SEARCH_KEY, "/app?q=x");
    expect(readLastIndexSearch()).toBe("");
  });

  it("doesn't throw when session storage refuses a write", () => {
    vi.spyOn(sessionStorage, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    expect(() => writeLastIndexSearch("?q=x")).not.toThrow();
  });

  it("renders /app first and the stored index query after mount", () => {
    sessionStorage.setItem(LAST_INDEX_SEARCH_KEY, "?q=x");
    const seen: string[] = [];

    render(<Breadcrumb seen={seen} />);

    expect(seen[0]).toBe("/app");
    expect(seen.at(-1)).toBe("/app?q=x");
    expect(
      screen.getByRole("link", { name: "Certificates" }).getAttribute("href"),
    ).toBe("/app?q=x");
  });

  it("server-renders /app", () => {
    sessionStorage.setItem(LAST_INDEX_SEARCH_KEY, "?q=x");

    expect(renderToString(<Breadcrumb seen={[]} />)).toBe(
      '<a href="/app">Certificates</a>',
    );
  });
});
