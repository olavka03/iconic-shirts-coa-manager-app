import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorSummary } from "./error-summary.component";

function listItems(container: HTMLElement): string[] {
  return [...container.querySelectorAll("s-list-item")].map(
    (item) => item.textContent ?? "",
  );
}

describe("ErrorSummary", () => {
  it("renders nothing without errors", () => {
    const onFocusField = vi.fn();
    const { container } = render(
      <ErrorSummary errors={{}} onFocusField={onFocusField} />,
    );

    expect(container.innerHTML).toBe("");
    expect(onFocusField).not.toHaveBeenCalled();
  });

  it("names the error count and lists the errors in field order", () => {
    const { container } = render(
      <ErrorSummary
        errors={{
          photo: "This photo is larger than 20 MB.",
          "signers.1.name": "Enter the signer's name.",
          order: "Select an order.",
        }}
        onFocusField={vi.fn()}
      />,
    );
    const banner = container.querySelector("s-banner")!;

    expect(banner.getAttribute("tone")).toBe("critical");
    expect(banner.getAttribute("slot")).toBe("supplemental-start");
    expect(banner.getAttribute("heading")).toBe(
      "There are 3 errors with this certificate",
    );
    expect(listItems(container)).toEqual([
      "Order: Select an order.",
      "Signer 2: Enter the signer's name.",
      "Photo: This photo is larger than 20 MB.",
    ]);
  });

  it("uses the singular heading for one error", () => {
    const { container } = render(
      <ErrorSummary
        errors={{ code: "Enter a certificate code." }}
        onFocusField={vi.fn()}
      />,
    );

    expect(container.querySelector("s-banner")!.getAttribute("heading")).toBe(
      "There is 1 error with this certificate",
    );
    expect(listItems(container)).toEqual([
      "Certificate code: Enter a certificate code.",
    ]);
  });

  it("asks the form to focus the first field once, when the banner appears", () => {
    const onFocusField = vi.fn();
    const { rerender } = render(
      <ErrorSummary errors={{}} onFocusField={onFocusField} />,
    );

    rerender(
      <ErrorSummary
        errors={{ notes: "Use 2,000 characters or fewer.", code: "c" }}
        onFocusField={onFocusField}
      />,
    );
    rerender(
      <ErrorSummary
        errors={{ notes: "Use 2,000 characters or fewer." }}
        onFocusField={onFocusField}
      />,
    );

    expect(onFocusField).toHaveBeenCalledTimes(1);
    expect(onFocusField).toHaveBeenCalledWith("code");
  });

  it("hides again when every error is fixed", () => {
    const { container, rerender } = render(
      <ErrorSummary
        errors={{ item: "Enter the item name." }}
        onFocusField={vi.fn()}
      />,
    );

    rerender(<ErrorSummary errors={{}} onFocusField={vi.fn()} />);

    expect(container.querySelector("s-banner")).toBeNull();
  });
});
