import { describe, expect, it } from "vitest";
import type { ProductValue } from "~/features/certificates/types/certificates.types";
import type { OrderCard } from "~/features/orders/types/orders.types";
import type { CertificateRecord } from "~/.server/repositories/certificate.types";
import {
  productValue,
  toCertificateDetail,
  toFormValues,
  toListItem,
} from "./certificate-views.utils";
import { testId } from "../../../../tests/helpers/test-ids.utils";

const CDN = "https://cdn.shopify.com/s/files/1/0000/0001/files";
const ORDER_ID = "gid://shopify/Order/5000001004";
const GULER_ID = "gid://shopify/LineItem/60001041";
const GULER_TITLE = "Arda Güler Signed Real Madrid 2026/27 Home Football Shirt";
const PHOTO_ID = "gid://shopify/MediaImage/11";
const VIDEO_ID = "gid://shopify/Video/12";

function record(overrides: Partial<CertificateRecord> = {}): CertificateRecord {
  return {
    id: testId(7),
    shop: "test-shop.myshopify.com",
    code: "IS141004AGRM2627",
    item: "Real Madrid 2026/27 Home Football Shirt",
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
    version: 1,
    createdAt: new Date("2026-03-12T10:00:00Z"),
    updatedAt: new Date("2026-03-12T10:00:00Z"),
    signers: [
      {
        name: "Arda Güler",
        date: { precision: "DAY", iso: "2026-09-20" },
        location: null,
      },
    ],
    ...overrides,
  };
}

describe("toListItem", () => {
  it.each([
    [{ photoUrl: `${CDN}/p.jpg`, videoUrl: `${CDN}/v.mp4` }, "Photo and video"],
    [{ photoFileId: PHOTO_ID, videoFileId: VIDEO_ID }, "Photo and video"],
    [{ photoUrl: `${CDN}/p.jpg` }, "Photo only"],
    [{ photoFileId: PHOTO_ID }, "Photo only"],
    [{ videoUrl: `${CDN}/v.mp4` }, "Video only"],
    [{ videoFileId: VIDEO_ID }, "Video only"],
    [{}, ""],
  ])("labels the proof of %o as %j", (media, label) => {
    expect(toListItem(record(media)).proofLabel).toBe(label);
  });

  it.each([
    [{ photoError: "INVALID_IMAGE_FILE_SIZE" }, "photo"],
    [{ videoError: "VIDEO_MAX_DURATION_ERROR" }, "video"],
    [
      {
        photoError: "INVALID_IMAGE_FILE_SIZE",
        videoError: "VIDEO_MAX_DURATION_ERROR",
      },
      "both",
    ],
    [{}, null],
  ])("reports failed media for %o as %j", (errors, failed) => {
    expect(toListItem(record(errors)).mediaFailed).toBe(failed);
  });

  it("uses the stored photo, else the product image", () => {
    const productImageUrl = `${CDN}/p-041.jpg`;

    expect(
      toListItem(record({ photoUrl: `${CDN}/p.jpg`, productImageUrl }))
        .imageUrl,
    ).toBe(`${CDN}/p.jpg`);
    expect(
      toListItem(record({ photoFileId: PHOTO_ID, productImageUrl })).imageUrl,
    ).toBe(productImageUrl);
    expect(toListItem(record()).imageUrl).toBeNull();
  });

  it("summarises the signers and their dates", () => {
    const item = toListItem(
      record({
        orderName: "#141005",
        signers: [
          {
            name: "Paul Scholes",
            date: { precision: "MONTH", iso: "2026-03" },
            location: null,
          },
          {
            name: "Ryan Giggs",
            date: { precision: "DAY", iso: "2026-05-02" },
            location: "Manchester",
          },
        ],
      }),
    );

    expect(item).toEqual({
      id: testId(7),
      code: "IS141004AGRM2627",
      item: "Real Madrid 2026/27 Home Football Shirt",
      signedBy: "Paul Scholes and Ryan Giggs",
      dateLabel: "Mar 2026–May 2026",
      proofLabel: "",
      mediaFailed: null,
      orderName: "#141005",
      imageUrl: null,
    });
  });
});

describe("toFormValues", () => {
  const product: ProductValue = {
    id: "gid://shopify/Product/70001041",
    title: GULER_TITLE,
    imageUrl: `${CDN}/p-041.jpg`,
    status: "ACTIVE",
    missing: false,
  };

  it("carries a linked certificate's order, item, product and media", () => {
    const values = toFormValues(
      record({
        orderId: ORDER_ID,
        orderName: "#141004",
        lineItemId: GULER_ID,
        lineItemTitle: GULER_TITLE,
        photoFileId: PHOTO_ID,
        photoUrl: `${CDN}/photo.jpg`,
        videoFileId: VIDEO_ID,
        productId: product.id,
        notes: "Signed at the training ground.",
      }),
      product,
    );

    expect(values).toEqual({
      code: "IS141004AGRM2627",
      item: "Real Madrid 2026/27 Home Football Shirt",
      notes: "Signed at the training ground.",
      order: { id: ORDER_ID, name: "#141004" },
      lineItem: { id: GULER_ID, title: GULER_TITLE },
      product,
      photo: {
        source: "file",
        fileId: PHOTO_ID,
        url: `${CDN}/photo.jpg`,
        previewUrl: null,
      },
      video: { source: "file", fileId: VIDEO_ID, url: null, previewUrl: null },
      signers: [
        {
          name: "Arda Güler",
          date: { precision: "DAY", iso: "2026-09-20" },
          location: "",
        },
      ],
    });
  });

  it("keeps a legacy certificate's backfilled order name without a line item", () => {
    const values = toFormValues(
      record({
        orderName: "#141909",
        videoUrl: "https://example.com/proof.mp4",
      }),
      null,
    );

    expect(values.order).toEqual({ id: null, name: "#141909" });
    expect(values.lineItem).toBeNull();
    expect(values.video).toEqual({
      source: "url",
      url: "https://example.com/proof.mp4",
    });
  });

  it("leaves an unlinked certificate without an order", () => {
    const values = toFormValues(record(), null);

    expect(values.order).toBeNull();
    expect(values.lineItem).toBeNull();
    expect(values.product).toBeNull();
    expect(values.photo).toBeNull();
    expect(values.video).toBeNull();
  });
});

describe("productValue", () => {
  const stored = {
    productId: "gid://shopify/Product/70001041",
    productTitle: "Stored title",
    productImageUrl: `${CDN}/stored.jpg`,
  };

  it("is null without a stored product", () => {
    expect(
      productValue(
        { productId: null, productTitle: null, productImageUrl: null },
        null,
      ),
    ).toBeNull();
  });

  it("uses the live product", () => {
    expect(
      productValue(stored, {
        id: stored.productId,
        title: "Live title",
        imageUrl: `${CDN}/live.jpg`,
        status: "DRAFT",
      }),
    ).toEqual({
      id: stored.productId,
      title: "Live title",
      imageUrl: `${CDN}/live.jpg`,
      status: "DRAFT",
      missing: false,
    });
  });

  it("marks a deleted product as missing with the stored title", () => {
    expect(productValue(stored, null)).toEqual({
      id: stored.productId,
      title: "Stored title",
      imageUrl: null,
      status: null,
      missing: true,
    });
  });

  it("falls back to the stored snapshot when the read failed", () => {
    expect(productValue(stored, "error")).toEqual({
      id: stored.productId,
      title: "Stored title",
      imageUrl: `${CDN}/stored.jpg`,
      status: null,
      missing: false,
    });
  });
});

describe("toCertificateDetail", () => {
  it("labels the dates in the shop's time zone and lists what is still pending", () => {
    const card: OrderCard = {
      createdLabel: "26 Sep 2026 at 11:04",
      fulfillment: { label: "Unfulfilled", tone: "caution" },
      cancelled: false,
      selectableItems: 1,
      lineItem: null,
    };
    const orderCertificates = [
      {
        id: testId(8),
        code: "IS141004AGRM2627-2",
        signers: "Arda Güler",
        item: "Real Madrid 2026/27 Home Football Shirt",
        lineItemId: GULER_ID,
      },
    ];
    const certificate = record({
      createdAt: new Date("2026-06-30T23:30:00Z"),
      updatedAt: new Date("2026-03-12T10:00:00Z"),
      photoFileId: PHOTO_ID,
      videoFileId: VIDEO_ID,
      videoUrl: `${CDN}/v.mp4`,
      photoError: "INVALID_IMAGE_FILE_SIZE",
    });

    const detail = toCertificateDetail(certificate, {
      product: null,
      orderCard: card,
      orderCertificates,
      timeZone: "Europe/London",
    });

    expect(detail).toEqual({
      id: testId(7),
      values: toFormValues(certificate, null),
      pendingFileIds: [PHOTO_ID],
      orderCard: card,
      orderCertificates,
      mediaErrors: { photo: "This photo is larger than 20 MB.", video: null },
      createdLabel: "1 Jul 2026",
      updatedLabel: "12 Mar 2026",
    });
  });
});
