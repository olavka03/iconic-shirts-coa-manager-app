import prisma from "~/.server/db/prisma.singleton";
import { insertCertificate } from "~/.server/repositories/certificate.repository";
import type { CertificateWrite } from "~/.server/repositories/certificate.types";
import { enqueueUpsert } from "~/.server/repositories/sync-queue.repository";
import { LINE_ITEM_IDS, ORDER_IDS } from "../fakes/orders.fake";

export const SHOP = "test-shop.myshopify.com";
export const OTHER_SHOP = "other-shop.myshopify.com";

export function makeWrite(
  overrides: Partial<CertificateWrite> = {},
): CertificateWrite {
  return {
    code: "IS141909ARS0",
    item: "Arsenal Home Shirt 2003-04",
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
    productId: null,
    productTitle: null,
    productImageUrl: null,
    signers: [
      {
        name: "Thierry Henry",
        date: { precision: "DAY", iso: "2019-11-28" },
        location: "London, United Kingdom",
      },
    ],
    ...overrides,
  };
}

export function linkedWrite(
  overrides: Partial<CertificateWrite> = {},
): CertificateWrite {
  return makeWrite({
    code: "IS141002RLBM1516",
    item: "Bayern Munich Football Shirt - 2015-16 Home",
    orderId: ORDER_IDS.order141002,
    orderName: "#141002",
    lineItemId: LINE_ITEM_IDS.bayern,
    lineItemTitle:
      "Robert Lewandowski Signed Bayern Munich Football Shirt - 2015-16 Home",
    signers: [{ name: "Robert Lewandowski", date: null, location: null }],
    ...overrides,
  });
}

export async function createCertificateRow(
  overrides: Partial<CertificateWrite> = {},
  options: { shop?: string; createdAt?: Date; enqueue?: boolean } = {},
): Promise<{ id: string; code: string; version: number }> {
  const shop = options.shop ?? SHOP;

  return prisma.$transaction(async (transaction) => {
    const certificate = await insertCertificate(
      transaction,
      shop,
      makeWrite(overrides),
      { createdAt: options.createdAt },
    );

    if (options.enqueue) {
      await enqueueUpsert(transaction, {
        shop,
        certificateId: certificate.id,
        version: certificate.version,
        handle: certificate.code.toLowerCase(),
      });
    }

    return certificate;
  });
}
