import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { MirrorSource } from "~/.server/repositories/certificate.types";
import {
  COLUMN_KEYS,
  DEFINITION_FIELDS,
  DEFINITION_INPUT,
  EXCLUDED_COLUMNS,
  diffDefinition,
  toMetaobjectValues,
} from "./mirror-values.utils";
import { testId } from "../../../../tests/helpers/test-ids.utils";

const base: MirrorSource = {
  id: testId(42),
  shop: "s.myshopify.com",
  code: "IS141002RLBM1516",
  item: "Bayern Munich Football Shirt - 2015-16 Home",
  notes: "",
  orderId: null,
  orderName: null,
  lineItemId: null,
  lineItemTitle: null,
  photoUrl: null,
  photoFileId: null,
  videoUrl: null,
  videoFileId: null,
  videoPreviewUrl: null,
  photoError: null,
  videoError: null,
  productId: null,
  productTitle: null,
  productImageUrl: null,
  version: 3,
  createdAt: new Date("2026-09-26T10:02:03.456Z"),
  updatedAt: new Date("2026-09-26T11:00:00.000Z"),
  signers: [
    {
      name: "Robert Lewandowski",
      date: { precision: "MONTH", iso: "2025-09" },
      location: null,
    },
  ],
};

describe("toMetaobjectValues (spec §7.2)", () => {
  it("maps a minimal certificate and omits empty values", () => {
    expect(toMetaobjectValues(base)).toEqual({
      certificate_id: testId(42),
      code: "IS141002RLBM1516",
      item: "Bayern Munich Football Shirt - 2015-16 Home",
      signed: "Robert Lewandowski",
      date: "September 2025",
      signers: [
        {
          name: "Robert Lewandowski",
          date_iso: "2025-09",
          date_precision: "month",
          location: null,
        },
      ],
      created_at: "2026-09-26T10:02:03Z",
      updated_at: "2026-09-26T11:00:00Z",
    });
  });

  it("carries every order, media, error and product field when set", () => {
    const values = toMetaobjectValues({
      ...base,
      orderId: "gid://shopify/Order/5000001002",
      orderName: "#141002",
      lineItemId: "gid://shopify/LineItem/60001021",
      lineItemTitle: "Robert Lewandowski Signed …",
      photoUrl: "https://cdn.shopify.com/s/files/a.jpg",
      photoFileId: "gid://shopify/MediaImage/1",
      photoError: null,
      videoUrl: null,
      videoFileId: "gid://shopify/Video/2",
      videoPreviewUrl: "https://cdn.shopify.com/p.jpg",
      videoError: "VIDEO_MAX_DURATION_ERROR",
      productId: "gid://shopify/Product/7",
      productTitle: "Robert Lewandowski Signed …",
      productImageUrl: "https://cdn.shopify.com/pi.jpg",
      notes: "Line 1\nLine 2",
    });

    expect(values).toMatchObject({
      order_id: "gid://shopify/Order/5000001002",
      order_name: "#141002",
      line_item_id: "gid://shopify/LineItem/60001021",
      line_item_title: "Robert Lewandowski Signed …",
      photo: "https://cdn.shopify.com/s/files/a.jpg",
      photo_file_id: "gid://shopify/MediaImage/1",
      video_file_id: "gid://shopify/Video/2",
      video_preview: "https://cdn.shopify.com/p.jpg",
      video_error: "VIDEO_MAX_DURATION_ERROR",
      product: "gid://shopify/Product/7",
      product_title: "Robert Lewandowski Signed …",
      product_image: "https://cdn.shopify.com/pi.jpg",
      notes: "Line 1\nLine 2",
    });
    expect(values).not.toHaveProperty("video");
    expect(values).not.toHaveProperty("photo_error");
  });

  it("keeps only order_name for a backfilled legacy certificate and drops non-https URLs", () => {
    const values = toMetaobjectValues({
      ...base,
      orderName: "#141909",
      photoUrl: "http://example.com/a.png",
      videoPreviewUrl: "ftp://example.com/p.jpg",
      productImageUrl: "not a url",
    });

    expect(values.order_name).toBe("#141909");

    for (const key of [
      "order_id",
      "line_item_id",
      "line_item_title",
      "photo",
      "video_preview",
      "product_image",
    ]) {
      expect(values).not.toHaveProperty(key);
    }
  });

  it("writes several signers in position order with day, month and missing dates", () => {
    const values = toMetaobjectValues({
      ...base,
      signers: [
        {
          name: "Thierry Henry",
          date: { precision: "DAY", iso: "2025-03-03" },
          location: "London, United Kingdom",
        },
        { name: "Dennis Bergkamp", date: null, location: "" },
      ],
    });

    expect(values.signers).toEqual([
      {
        name: "Thierry Henry",
        date_iso: "2025-03-03",
        date_precision: "day",
        location: "London, United Kingdom",
      },
      {
        name: "Dennis Bergkamp",
        date_iso: null,
        date_precision: null,
        location: null,
      },
    ]);
    expect(values).toMatchObject({
      signed: "Thierry Henry and Dennis Bergkamp",
      date: "3 March 2025 (Thierry Henry)",
      location: "London, United Kingdom (Thierry Henry)",
    });
  });

  it("classifies every Certificate column (a new column fails until it is mapped or excluded)", () => {
    const columns = Object.keys(Prisma.CertificateScalarFieldEnum);
    const classified = new Set([
      ...Object.keys(COLUMN_KEYS),
      ...Object.keys(EXCLUDED_COLUMNS),
    ]);
    const keys = new Set(DEFINITION_FIELDS.map((field) => field.key));

    expect(columns.filter((column) => !classified.has(column))).toEqual([]);
    expect(
      Object.values(COLUMN_KEYS)
        .flat()
        .filter((key) => !keys.has(key)),
    ).toEqual([]);
    expect(DEFINITION_FIELDS).toHaveLength(24);
  });

  it("writes only keys of the definition", () => {
    const keys = new Set(DEFINITION_FIELDS.map((field) => field.key));
    const everything = toMetaobjectValues({
      ...base,
      notes: "n",
      orderId: "gid://shopify/Order/1",
      orderName: "#1",
      lineItemId: "gid://shopify/LineItem/1",
      lineItemTitle: "t",
      photoUrl: "https://cdn.shopify.com/a.jpg",
      photoFileId: "gid://shopify/MediaImage/1",
      photoError: "NOT_FOUND",
      videoUrl: "https://cdn.shopify.com/v.mp4",
      videoFileId: "gid://shopify/Video/1",
      videoPreviewUrl: "https://cdn.shopify.com/p.jpg",
      videoError: "NOT_FOUND",
      productId: "gid://shopify/Product/1",
      productTitle: "p",
      productImageUrl: "https://cdn.shopify.com/pi.jpg",
      signers: [
        {
          name: "A",
          date: { precision: "DAY", iso: "2025-01-02" },
          location: "L",
        },
      ],
    });

    expect(Object.keys(everything).sort()).toEqual([...keys].sort());
  });

  it("describes a merchant-owned type hidden from the storefront", () => {
    expect(DEFINITION_INPUT).toEqual({
      type: "coa_certificate",
      name: "COA Certificate",
      description:
        "Managed by the COA Manager app. Edit certificates in the app; changes made here are overwritten.",
      displayNameKey: "code",
      access: { storefront: "NONE" },
      fieldDefinitions: [...DEFINITION_FIELDS],
    });
    expect(DEFINITION_FIELDS.filter((field) => field.required)).toEqual([
      {
        key: "code",
        name: "Code",
        type: "single_line_text_field",
        required: true,
      },
    ]);
  });
});

describe("diffDefinition (spec §7.1)", () => {
  it("adds the revision 4 keys to an older definition and reports type conflicts without changing them", () => {
    const keysBeforeRevision4 = [
      "code",
      "item",
      "signed",
      "date",
      "location",
      "signers",
      "photo",
      "video",
      "notes",
      "product",
      "created_at",
      "updated_at",
    ];
    const existing = DEFINITION_FIELDS.filter((field) =>
      keysBeforeRevision4.includes(field.key),
    ).map((field) => ({
      key: field.key,
      type: field.key === "notes" ? "single_line_text_field" : field.type,
    }));
    const diff = diffDefinition([
      ...existing,
      { key: "order_number", type: "single_line_text_field" },
    ]);

    expect(existing).toHaveLength(keysBeforeRevision4.length);
    expect(diff.create.map((field) => field.key)).toEqual([
      "certificate_id",
      "photo_file_id",
      "photo_error",
      "video_file_id",
      "video_preview",
      "video_error",
      "order_id",
      "order_name",
      "line_item_id",
      "line_item_title",
      "product_title",
      "product_image",
    ]);
    expect(diff.conflicts).toEqual([
      {
        key: "notes",
        expected: "multi_line_text_field",
        actual: "single_line_text_field",
      },
    ]);
  });

  it("finds nothing to do for the current definition", () => {
    expect(diffDefinition(DEFINITION_FIELDS)).toEqual({
      create: [],
      conflicts: [],
    });
  });
});
