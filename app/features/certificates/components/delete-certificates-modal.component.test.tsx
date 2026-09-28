import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  DeleteCertificatesModal,
  deleteModalCopy,
} from "./delete-certificates-modal.component";
import { deferred } from "../../../../tests/helpers/fetch-stub.utils";

function renderModal(
  props: Partial<Parameters<typeof DeleteCertificatesModal>[0]> = {},
) {
  const onConfirm = vi.fn(async () => true);
  const onDeleted = vi.fn();
  const view = render(
    <DeleteCertificatesModal
      id="bulk-delete-modal"
      codes={["IS141816PMM", "IS141909TH"]}
      onConfirm={onConfirm}
      onDeleted={onDeleted}
      {...props}
    />,
  );
  const modal = view.container.querySelector("s-modal")!;
  const hideOverlay = vi.fn();
  Object.assign(modal, { hideOverlay });
  const primary = modal.querySelector('s-button[slot="primary-action"]')!;

  return { ...view, modal, primary, hideOverlay, onConfirm, onDeleted };
}

describe("deleteModalCopy", () => {
  it("names the code when one certificate is deleted", () => {
    expect(deleteModalCopy(["IS141816PMM"])).toEqual({
      heading: "Delete IS141816PMM?",
      body: "Customers won't be able to verify this code on your verification page anymore. This can't be undone.",
      action: "Delete certificate",
    });
  });

  it.each([
    [["A1", "B2"], "A1 and B2"],
    [["A1", "B2", "C3"], "A1, B2, and C3"],
    [["A1", "B2", "C3", "D4"], "A1, B2, C3, and 1 other code"],
    [["A1", "B2", "C3", "D4", "E5"], "A1, B2, C3, and 2 other codes"],
  ])("lists %j", (codes, listed) => {
    expect(deleteModalCopy(codes)).toEqual({
      heading: `Delete ${codes.length} certificates?`,
      body: `Customers won't be able to verify ${listed} anymore. This can't be undone.`,
      action: `Delete ${codes.length} certificates`,
    });
  });
});

describe("DeleteCertificatesModal", () => {
  it("renders the copy and a cancel button for its own id", () => {
    const { modal } = renderModal();

    expect(modal.id).toBe("bulk-delete-modal");
    expect(modal.getAttribute("heading")).toBe("Delete 2 certificates?");
    expect(modal.querySelector("s-paragraph")!.textContent).toBe(
      "Customers won't be able to verify IS141816PMM and IS141909TH anymore. This can't be undone.",
    );

    const cancel = modal.querySelector('s-button[slot="secondary-actions"]')!;

    expect(cancel.getAttribute("commandFor")).toBe("bulk-delete-modal");
    expect(cancel.getAttribute("command")).toBe("--hide");
    expect(cancel.textContent).toBe("Cancel");
  });

  it("shows loading while deleting, then closes and reports the delete", async () => {
    const pending = deferred<boolean>();
    const onConfirm = vi.fn(() => pending.promise);
    const { primary, hideOverlay, onDeleted } = renderModal({ onConfirm });

    expect(primary.getAttribute("variant")).toBe("primary");
    expect(primary.getAttribute("tone")).toBe("critical");
    expect(primary.textContent).toBe("Delete 2 certificates");
    expect(primary.hasAttribute("loading")).toBe(false);

    fireEvent.click(primary);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(primary.hasAttribute("loading")).toBe(true);
    expect(hideOverlay).not.toHaveBeenCalled();

    await act(async () => pending.resolve(true));

    expect(primary.hasAttribute("loading")).toBe(false);
    expect(hideOverlay).toHaveBeenCalledTimes(1);
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it("keeps the modal open with a banner when the delete fails", async () => {
    const { modal, primary, hideOverlay, onDeleted } = renderModal({
      onConfirm: vi.fn(async () => false),
    });

    await act(async () => {
      fireEvent.click(primary);
    });

    const banner = modal.querySelector("s-banner")!;

    expect(banner.getAttribute("tone")).toBe("critical");
    expect(banner.textContent).toBe(
      "The certificates couldn't be deleted. Try again.",
    );
    expect(hideOverlay).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(primary.hasAttribute("loading")).toBe(false);
  });

  it("uses the singular banner on the certificate page", async () => {
    const { modal, primary } = renderModal({
      id: "delete-certificate-modal",
      codes: ["IS141816PMM"],
      onConfirm: vi.fn(async () => false),
    });

    await act(async () => {
      fireEvent.click(primary);
    });

    expect(modal.getAttribute("heading")).toBe("Delete IS141816PMM?");
    expect(primary.textContent).toBe("Delete certificate");
    expect(modal.querySelector("s-banner")!.textContent).toBe(
      "The certificate couldn't be deleted. Try again.",
    );
  });

  it("clears the banner once the modal has closed", async () => {
    const { modal, primary } = renderModal({
      onConfirm: vi.fn(async () => false),
    });

    await act(async () => {
      fireEvent.click(primary);
    });
    act(() => {
      modal.dispatchEvent(new Event("afterhide"));
    });

    expect(modal.querySelector("s-banner")).toBeNull();
  });

  it("focuses the delete button once the modal is shown", () => {
    const { modal, primary } = renderModal();

    act(() => {
      modal.dispatchEvent(new Event("aftershow"));
    });

    expect(document.activeElement).toBe(primary);
  });

  it("keeps showing the deleted codes while the modal closes", async () => {
    const { modal, primary, rerender, onConfirm, onDeleted } = renderModal();

    await act(async () => {
      fireEvent.click(primary);
    });
    rerender(
      <DeleteCertificatesModal
        id="bulk-delete-modal"
        codes={[]}
        onConfirm={onConfirm}
        onDeleted={onDeleted}
      />,
    );

    expect(modal.getAttribute("heading")).toBe("Delete 2 certificates?");
  });
});
