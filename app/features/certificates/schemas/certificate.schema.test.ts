import { describe, expect, it } from "vitest";
import {
  ITEM_MAX,
  LOCATION_MAX,
  NOTES_MAX,
  SIGNER_NAME_MAX,
  SIGNERS_MAX,
} from "~/features/certificates/constants/certificate-limits.constants";
import {
  CertificateInputSchema as Update,
  CreateCertificateInputSchema as Create,
  ImportCertificateInputSchema as Import,
  SCHEMA_MESSAGES,
  codeConflictMessage,
  toFieldErrors,
} from "./certificate.schema";

const valid = {
  code: " is141002rlbm1516 ",
  order: { id: "gid://shopify/Order/5000001002", name: "#141002" },
  lineItem: {
    id: "gid://shopify/LineItem/60001021",
    title:
      "Robert Lewandowski Signed Bayern Munich Football Shirt - 2015-16 Home",
  },
  item: "Bayern Munich Football Shirt - 2015-16 Home",
  productId: null,
  photo: null,
  video: null,
  notes: " a\r\nb ",
  signers: [
    {
      name: " Robert Lewandowski ",
      date: { precision: "DAY", iso: "2025-09-10" },
      location: "",
    },
  ],
};
const errors = (schema: typeof Update, value: unknown) => {
  const result = schema.safeParse(value);

  return result.success ? null : toFieldErrors(result.error);
};

describe("certificate input", () => {
  it("normalises a valid create", () => {
    expect(Create.parse(valid)).toEqual({
      ...valid,
      code: "IS141002RLBM1516",
      productHint: null,
      notes: "a\nb",
      signers: [
        {
          name: "Robert Lewandowski",
          date: { precision: "DAY", iso: "2025-09-10" },
          location: null,
        },
      ],
    });
  });
  it("requires an order on create, never on update", () => {
    expect(errors(Create, { ...valid, order: null, lineItem: null })).toEqual({
      order: "Select an order.",
    });
    expect(
      errors(Update, { ...valid, order: null, lineItem: null }),
    ).toBeNull();
  });
  it("pairs order and line item", () => {
    expect(errors(Update, { ...valid, lineItem: null })).toEqual({
      lineItem: "Select the item this certificate is for.",
    });
    expect(errors(Update, { ...valid, order: null })).toEqual({
      order: "Select an order.",
    });
    expect(
      errors(Update, {
        ...valid,
        order: { id: "gid://shopify/Product/1", name: "#1" },
      }),
    ).toEqual({ order: "Select an order." });
  });
  it.each([
    ["", "Enter a certificate code."],
    ["IS_1", "Use only letters, numbers, and hyphens."],
    ["AB", "Use between 4 and 32 characters."],
  ])("code %j → %s", (code, message) =>
    expect(errors(Update, { ...valid, code })).toEqual({ code: message }),
  );
  it("validates the item", () => {
    expect(errors(Update, { ...valid, item: "" })).toEqual({
      item: "Enter the item name.",
    });
    expect(errors(Update, { ...valid, item: "a\nb" })).toEqual({
      item: "Use a single line.",
    });
    expect(errors(Update, { ...valid, item: "x".repeat(201) })).toEqual({
      item: "Use 200 characters or fewer.",
    });
    expect(errors(Import, { ...valid, item: "" })).toBeNull();
    expect(errors(Import, { ...valid, item: "x".repeat(201) })).toEqual({
      item: "Use 200 characters or fewer.",
    });
  });
  it("validates signers", () => {
    expect(
      errors(Update, {
        ...valid,
        signers: [
          valid.signers[0],
          { name: "robert lewandówski", date: null, location: null },
        ],
      }),
    ).toEqual({ "signers.1.name": "This signer is already listed." });
    expect(
      errors(Import, {
        ...valid,
        signers: [
          valid.signers[0],
          { name: "Robert Lewandowski", date: null, location: null },
        ],
      }),
    ).toEqual({ "signers.1.name": "This signer is already listed." });
    expect(
      errors(Update, {
        ...valid,
        signers: [{ name: "", date: null, location: "x" }],
      }),
    ).toEqual({ "signers.0.name": "Enter the signer's name." });
    expect(
      errors(Update, {
        ...valid,
        signers: [{ name: "A", date: null, location: "x".repeat(151) }],
      }),
    ).toEqual({ "signers.0.location": "Use 150 characters or fewer." });
    expect(
      errors(Update, {
        ...valid,
        signers: [
          {
            name: "A",
            date: { precision: "DAY", iso: "2099-01-01" },
            location: null,
          },
        ],
      }),
    ).toEqual({ "signers.0.date": "Date signed can't be in the future." });
    expect(
      errors(Update, {
        ...valid,
        signers: [
          {
            name: "A",
            date: { precision: "MONTH", iso: "2026-13" },
            location: null,
          },
        ],
      }),
    ).toEqual({ "signers.0.date": "Enter a valid date." });
    expect(
      errors(Update, {
        ...valid,
        signers: Array.from({ length: 51 }, (_unusedValue, index) => ({
          name: `N${index}`,
          date: null,
          location: null,
        })),
      }),
    ).toEqual({ signers: "You can add up to 50 signers." });
  });
  it("validates notes and media", () => {
    expect(errors(Update, { ...valid, notes: "x".repeat(2001) })).toEqual({
      notes: "Use 2,000 characters or fewer.",
    });
    expect(
      errors(Update, { ...valid, photo: { source: "url", url: "http://x" } }),
    ).toEqual({ photo: "Enter a link that starts with https://" });
    expect(
      errors(Update, {
        ...valid,
        video: { source: "file", fileId: "gid://shopify/MediaImage/1" },
      }),
    ).toHaveProperty("video");
    expect(
      Update.parse({
        ...valid,
        photo: {
          source: "file",
          fileId: "gid://shopify/MediaImage/1",
          url: null,
          previewUrl: null,
        },
      }).photo,
    ).toEqual({ source: "file", fileId: "gid://shopify/MediaImage/1" });
  });
  it("defaults productHint to null and checks its image", () => {
    expect(Update.parse(valid).productHint).toBeNull();
    expect(
      errors(Update, {
        ...valid,
        productHint: { title: "T", imageUrl: "http://x" },
      }),
    ).toHaveProperty(["productHint.imageUrl"]);
  });
  it("words the code conflict", () => {
    expect(
      codeConflictMessage({
        signers: "Robert Lewandowski",
        item: "Bayern Munich Football Shirt - 2015-16 Home",
      }),
    ).toBe(
      "This code is already used for Robert Lewandowski, Bayern Munich Football Shirt - 2015-16 Home.",
    );
    expect(codeConflictMessage({ signers: "A and B", item: "" })).toBe(
      "This code is already used for A and B.",
    );
    expect(codeConflictMessage({ signers: "A", item: "x".repeat(70) })).toBe(
      `This code is already used for A, ${"x".repeat(60)}….`,
    );
  });
  it("limits signer names to 120 characters", () => {
    expect(
      errors(Update, {
        ...valid,
        signers: [{ name: "x".repeat(121), date: null, location: null }],
      }),
    ).toEqual({ "signers.0.name": "Use 120 characters or fewer." });
  });
  it("requires at least one signer", () => {
    expect(errors(Update, { ...valid, signers: [] })).toEqual({
      signers: "Enter the signer's name.",
    });
  });
  it("keeps signer names and locations on a single line", () => {
    expect(
      errors(Update, {
        ...valid,
        signers: [{ name: "A\nB", date: null, location: "a\rb" }],
      }),
    ).toEqual({
      "signers.0.name": "Use a single line.",
      "signers.0.location": "Use a single line.",
    });
  });
  it("rejects an order id as a line item", () => {
    expect(
      errors(Update, {
        ...valid,
        lineItem: { id: "gid://shopify/Order/1", title: "T" },
      }),
    ).toEqual({ lineItem: "Select the item this certificate is for." });
  });
  it("limits the order name to 64 characters", () => {
    expect(
      errors(Update, {
        ...valid,
        order: { id: valid.order.id, name: "x".repeat(65) },
      }),
    ).toEqual({ order: "Select an order." });
  });
  it("trims media links and locations", () => {
    expect(
      Update.parse({
        ...valid,
        photo: { source: "url", url: " https://cdn.example.com/a.jpg " },
        signers: [{ name: "A", date: null, location: " Munich " }],
      }),
    ).toMatchObject({
      photo: { source: "url", url: "https://cdn.example.com/a.jpg" },
      signers: [{ name: "A", date: null, location: "Munich" }],
    });
  });
  it("names each limit in its message", () => {
    const limits: [string, number][] = [
      [SCHEMA_MESSAGES.itemTooLong, ITEM_MAX],
      [SCHEMA_MESSAGES.signerTooLong, SIGNER_NAME_MAX],
      [SCHEMA_MESSAGES.locationTooLong, LOCATION_MAX],
      [SCHEMA_MESSAGES.notesTooLong, NOTES_MAX],
      [SCHEMA_MESSAGES.signersMax, SIGNERS_MAX],
    ];

    for (const [message, limit] of limits) {
      expect(message).toContain(limit.toLocaleString("en-US"));
    }
  });
  it("accepts a month-precision date", () => {
    expect(
      Update.parse({
        ...valid,
        signers: [
          {
            name: "A",
            date: { precision: "MONTH", iso: "2016-03" },
            location: null,
          },
        ],
      }).signers,
    ).toEqual([
      {
        name: "A",
        date: { precision: "MONTH", iso: "2016-03" },
        location: null,
      },
    ]);
  });
});
