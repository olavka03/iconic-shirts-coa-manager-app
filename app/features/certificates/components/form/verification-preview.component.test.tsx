import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CertificateFormValues } from "~/features/certificates/types/certificates.types";
import { formReducer } from "~/features/certificates/reducers/certificate-form.reducer";
import type {
  FormAction,
  FormState,
} from "~/features/certificates/types/certificate-form.types";
import { VerificationPreview } from "./verification-preview.component";
import {
  certificateFormBuilders,
  signerValue,
} from "../../../../../tests/helpers/certificate-form.factory";

const ARSENAL_ITEM = "Arsenal FC Original 2003–04 Home Shirt";

const { formValues, openForm } = certificateFormBuilders({
  values: {
    code: "IS141909THDBA",
    item: ARSENAL_ITEM,
    order: { id: "gid://shopify/Order/141909", name: "#141909" },
    lineItem: {
      id: "gid://shopify/LineItem/1",
      title: "Thierry Henry and Dennis Bergkamp Signed Arsenal Shirt",
    },
    signers: [
      signerValue("Thierry Henry", {
        date: { precision: "DAY", iso: "2025-03-03" },
        location: "London, UK",
      }),
      signerValue("Dennis Bergkamp", {
        date: { precision: "DAY", iso: "2024-10-29" },
        location: "London, UK",
      }),
    ],
  },
});

function run(state: FormState, ...actions: FormAction[]): FormState {
  return actions.reduce(formReducer, state);
}

function showPreview(
  state: FormState,
  labels: { createdLabel: string | null; updatedLabel: string | null } = {
    createdLabel: null,
    updatedLabel: null,
  },
) {
  const view = render(<VerificationPreview state={state} {...labels} />);
  const texts = () =>
    [...view.container.querySelectorAll("s-grid > s-text")].map(
      (text) => text.textContent ?? "",
    );

  return { ...view, texts };
}

describe("VerificationPreview", () => {
  it("shows what customers see, composed like the verification page", () => {
    const { container, texts } = showPreview(openForm("edit"));
    const section = container.querySelector("s-section")!;

    expect(section.getAttribute("heading")).toBe("Preview");
    expect(section.getAttribute("subheading")).toBe(
      "What customers see when they check this code.",
    );
    expect(container.querySelector("s-heading")!.textContent).toBe(
      "IS141909THDBA",
    );
    expect(texts()).toEqual([
      "Signed by",
      "Thierry Henry and Dennis Bergkamp",
      "Item",
      ARSENAL_ITEM,
      "Date signed",
      "3 March 2025 (Thierry Henry); 29 October 2024 (Dennis Bergkamp)",
      "Location",
      "London, UK",
    ]);
  });

  it("shows a month-precision date and the proof and notes rows", () => {
    const state = openForm(
      "edit",
      formValues({
        signers: [
          signerValue("Thierry Henry", {
            date: { precision: "MONTH", iso: "2026-04" },
          }),
        ],
        notes: "Signed at a private event.",
        photo: {
          source: "url",
          url: "https://cdn.shopify.com/s/files/proof.jpg",
        },
      }),
    );
    const { texts } = showPreview(state);

    expect(texts()).toEqual([
      "Signed by",
      "Thierry Henry",
      "Item",
      ARSENAL_ITEM,
      "Date signed",
      "April 2026",
      "Proof",
      "Photo only",
      "Notes",
      "Signed at a private event.",
    ]);
  });

  it("uses the list's proof labels", () => {
    const photo = {
      source: "url" as const,
      url: "https://cdn.shopify.com/s/files/proof.jpg",
    };
    const video = {
      source: "file" as const,
      fileId: "gid://shopify/Video/1",
      url: null,
      previewUrl: null,
    };
    const proofOf = (values: Partial<CertificateFormValues>) => {
      const { texts, unmount } = showPreview(
        openForm("edit", formValues(values)),
      );
      const shown = texts();

      unmount();

      return shown[shown.indexOf("Proof") + 1];
    };

    expect(proofOf({ photo, video })).toBe("Photo and video");
    expect(proofOf({ video })).toBe("Video only");
  });

  it("updates live from the draft, with the shared values in mode 2", () => {
    const state = run(
      openForm("edit"),
      { type: "setSharedOn", on: true },
      {
        type: "setLocation",
        target: { scope: "shared" },
        value: "Amsterdam, Netherlands",
      },
      { type: "setCode", value: "is141909 thdba2" },
    );
    const { container, texts } = showPreview(state);

    expect(container.querySelector("s-heading")!.textContent).toBe(
      "IS141909THDBA2",
    );
    expect(texts()).toContain("3 March 2025");
    expect(texts()).toContain("Amsterdam, Netherlands");
  });

  it("shows the empty state until an item or a signer is entered", () => {
    const empty = openForm("create", formValues({ code: "", signers: [] }));
    const { container, unmount } = showPreview(empty);

    expect(container.querySelector("s-heading")!.textContent).toBe(
      "Certificate code",
    );
    expect(container.querySelector("s-grid")).toBeNull();
    expect(container.textContent).toContain("Details you add appear here.");

    unmount();

    const { texts } = showPreview(
      run(empty, { type: "setItem", value: ARSENAL_ITEM }),
    );

    expect(texts()).toEqual(["Item", ARSENAL_ITEM]);
  });

  it("adds the created and updated dates below a divider on edit only", () => {
    const edit = showPreview(openForm("edit"), {
      createdLabel: "3 Mar 2025",
      updatedLabel: "26 Sep 2026",
    });

    expect(edit.container.querySelector("s-divider")).not.toBeNull();
    expect(edit.container.textContent).toContain(
      "Created 3 Mar 2025 · Last updated 26 Sep 2026",
    );

    edit.unmount();

    const created = showPreview(openForm("create"));

    expect(created.container.querySelector("s-divider")).toBeNull();
    expect(created.container.textContent).not.toContain("Created");
  });

  it("never shows the order", () => {
    const { container } = showPreview(openForm("edit"));

    expect(container.textContent).not.toContain("141909 ");
    expect(container.textContent).not.toContain("#141909");
    expect(container.textContent).not.toContain("Signed Arsenal Shirt");
  });
});
