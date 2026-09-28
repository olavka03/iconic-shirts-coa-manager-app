import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CertificateSkeleton, IndexSkeleton } from "./page-skeleton.component";

const blocksIn = (element: Element) =>
  element.querySelectorAll('s-box[background="strong"]').length;

describe("IndexSkeleton", () => {
  it("imitates the toolbar, the header row and 25 table rows", () => {
    const { container } = render(<IndexSkeleton view="table" />);
    const busy = container.querySelector('[aria-busy="true"]')!;
    const toolbar = container.querySelector("s-query-container > s-grid")!;
    const rows = container.querySelectorAll(
      's-grid[gridTemplateColumns="auto auto 2fr 2fr 3fr 1fr 1fr 1fr"]',
    );

    expect(
      screen
        .getByText("Loading certificates")
        .getAttribute("accessibilityVisibility"),
    ).toBe("exclusive");
    expect(busy.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(toolbar.getAttribute("gridTemplateColumns")).toBe(
      "@container (inline-size > 720px) 1fr auto, 1fr",
    );
    expect(blocksIn(toolbar)).toBe(5);
    expect(rows).toHaveLength(26);
    expect(
      blocksIn(
        container.querySelector('s-grid[gridTemplateColumns="1fr auto 1fr"]')!,
      ),
    ).toBe(6);
    expect(blocksIn(rows[1])).toBe(8);
  });

  it("imitates the cards in the real grid columns", () => {
    const { container } = render(<IndexSkeleton view="grid" />);
    const grids = container.querySelectorAll("s-query-container > s-grid");
    const cards = grids[1];

    expect(cards.getAttribute("gridTemplateColumns")).toContain(
      "(inline-size > 1200px)",
    );
    expect(cards.children.length).toBeGreaterThanOrEqual(8);
  });
});

describe("CertificateSkeleton", () => {
  it("shows only blocks: five sections, two media blocks and the aside", () => {
    const { container } = render(<CertificateSkeleton />);
    const page = container.querySelector("s-page")!;

    expect(page.hasAttribute("heading")).toBe(false);
    expect(container.querySelectorAll("s-section")).toHaveLength(6);
    expect(
      container.querySelectorAll("s-section[heading], [label]"),
    ).toHaveLength(0);
    expect(page.textContent).toBe("Loading certificate");
    expect(container.querySelectorAll('s-box[blockSize="160px"]')).toHaveLength(
      2,
    );
    expect(container.querySelector('[slot="aside"] s-section')).not.toBeNull();
    expect(
      blocksIn(container.querySelector('s-box[slot="supplemental-start"]')!),
    ).toBe(1);
  });
});
