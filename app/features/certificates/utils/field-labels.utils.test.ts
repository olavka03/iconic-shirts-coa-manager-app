import { describe, expect, it } from "vitest";
import {
  FIELD_ORDER,
  fieldError,
  orderedErrors,
  summaryHeading,
} from "./field-labels.utils";

describe("orderedErrors", () => {
  it("lists errors in field order with their summary labels", () => {
    expect(
      orderedErrors({
        notes: "n",
        "signers.1.name": "Enter the signer's name.",
        order: "Select an order.",
        code: "c",
      }),
    ).toEqual([
      { key: "order", label: "Order", message: "Select an order." },
      { key: "code", label: "Certificate code", message: "c" },
      {
        key: "signers.1.name",
        label: "Signer 2",
        message: "Enter the signer's name.",
      },
      { key: "notes", label: "Notes", message: "n" },
    ]);
  });

  it("labels both order errors Order and puts them first", () => {
    const labels = orderedErrors({
      item: "Enter the item name.",
      lineItem: "Select the item this certificate is for.",
    }).map((entry) => [entry.key, entry.label]);

    expect(labels).toEqual([
      ["lineItem", "Order"],
      ["item", "Item"],
    ]);
  });

  it("orders signers by row, then name, date and location", () => {
    const keys = orderedErrors({
      "signers.10.name": "a",
      "signers.2.location": "b",
      "signers.2.year": "c",
      "signers.2.name": "d",
      "signers.2.month": "e",
      "signers.2.date": "f",
      photo: "g",
      video: "h",
    }).map((entry) => entry.key);

    expect(keys).toEqual([
      "signers.2.name",
      "signers.2.date",
      "signers.2.month",
      "signers.2.year",
      "signers.2.location",
      "signers.10.name",
      "photo",
      "video",
    ]);
  });

  it("shows product hint errors as the linked product and never drops a key", () => {
    const entries = orderedErrors({
      "": "Invalid input",
      notes: "n",
      "productHint.imageUrl": "Invalid input",
      productId: "p",
      signers: "You can add up to 50 signers.",
      item: "i",
    });

    expect(
      entries.map((entry) => [entry.key, entry.label, entry.message]),
    ).toEqual([
      ["item", "Item", "i"],
      ["productId", "Linked product", "p"],
      ["productHint.imageUrl", "Linked product", "Invalid input"],
      ["signers", "Signed by", "You can add up to 50 signers."],
      ["notes", "Notes", "n"],
      ["", "Certificate", "Invalid input"],
    ]);
  });

  it("returns nothing without errors", () => {
    expect(orderedErrors({})).toEqual([]);
  });

  it("keeps the documented field order", () => {
    expect(FIELD_ORDER).toEqual([
      "order",
      "lineItem",
      "code",
      "item",
      "productId",
      "signers.*",
      "photo",
      "video",
      "notes",
    ]);
  });
});

describe("summaryHeading", () => {
  it("counts the errors in a sentence", () => {
    expect(summaryHeading(1)).toBe("There is 1 error with this certificate");
    expect(summaryHeading(3)).toBe("There are 3 errors with this certificate");
  });
});

describe("fieldError", () => {
  it("reads only the field's own error", () => {
    const errors = { code: "Enter a certificate code." };

    expect(fieldError(errors, "code")).toBe("Enter a certificate code.");
    expect(fieldError(errors, "item")).toBeUndefined();
    expect(fieldError(errors, "constructor")).toBeUndefined();
  });
});
