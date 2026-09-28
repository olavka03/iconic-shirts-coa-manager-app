import { describe, expect, it } from "vitest";
import prisma from "~/.server/db/prisma.singleton";

const BASE_ROW = {
  shop: "test-shop.myshopify.com",
  item: "Arsenal Home Shirt",
};
const LONGEST_CODE = `IS${"1".repeat(30)}`;
const ORDER_LINK = {
  orderId: "gid://shopify/Order/1",
  orderName: "#141909",
  lineItemId: "gid://shopify/LineItem/2",
  lineItemTitle: "Title",
};

describe("database CHECK constraints (spec §3.2)", () => {
  it("accepts canonical codes only", async () => {
    await expect(
      prisma.certificate.create({
        data: { ...BASE_ROW, code: "IS141909ARS0" },
      }),
    ).resolves.toMatchObject({ code: "IS141909ARS0" });
    await expect(
      prisma.certificate.create({ data: { ...BASE_ROW, code: "is141909" } }),
    ).rejects.toThrow(/certificates_code_canonical/);
    await expect(
      prisma.certificate.create({ data: { ...BASE_ROW, code: "IS1" } }),
    ).rejects.toThrow(/certificates_code_canonical/);
    await expect(
      prisma.certificate.create({ data: { ...BASE_ROW, code: "IS-1-" } }),
    ).rejects.toThrow(/certificates_code_canonical/);
    await expect(
      prisma.certificate.create({ data: { ...BASE_ROW, code: LONGEST_CODE } }),
    ).resolves.toMatchObject({ code: LONGEST_CODE });
    await expect(
      prisma.certificate.create({
        data: { ...BASE_ROW, code: `${LONGEST_CODE}1` },
      }),
    ).rejects.toThrow(/certificates_code_canonical/);
  });

  it("rejects a half-filled order link and accepts a legacy row with only orderName", async () => {
    await expect(
      prisma.certificate.create({
        data: {
          ...BASE_ROW,
          code: "ISA1",
          orderId: ORDER_LINK.orderId,
          orderName: ORDER_LINK.orderName,
        },
      }),
    ).rejects.toThrow(/certificates_order_link_complete/);
    await expect(
      prisma.certificate.create({
        data: {
          ...BASE_ROW,
          code: "ISB1",
          orderId: ORDER_LINK.orderId,
          lineItemId: ORDER_LINK.lineItemId,
          lineItemTitle: "T",
        },
      }),
    ).rejects.toThrow(/certificates_order_link_complete/);
    await expect(
      prisma.certificate.create({
        data: {
          ...BASE_ROW,
          code: "ISF1",
          orderId: ORDER_LINK.orderId,
          orderName: ORDER_LINK.orderName,
          lineItemId: ORDER_LINK.lineItemId,
        },
      }),
    ).rejects.toThrow(/certificates_order_link_complete/);
    await expect(
      prisma.certificate.create({
        data: { ...BASE_ROW, code: "ISC1", orderName: "#141909" },
      }),
    ).resolves.toBeTruthy();
    await expect(
      prisma.certificate.create({
        data: { ...BASE_ROW, code: "ISD1", ...ORDER_LINK },
      }),
    ).resolves.toBeTruthy();
  });

  it("pairs signedOn with datePrecision and keeps MONTH dates on the 1st", async () => {
    const certificate = await prisma.certificate.create({
      data: { ...BASE_ROW, code: "ISE1" },
    });
    const signer = (data: object) =>
      prisma.signer.create({
        data: {
          certificateId: certificate.id,
          position: 0,
          name: "A",
          ...data,
        },
      });
    await expect(
      signer({
        signedOn: new Date("2026-04-01T00:00:00Z"),
        datePrecision: "MONTH",
      }),
    ).resolves.toBeTruthy();
    await expect(
      signer({
        signedOn: new Date("2026-04-02T00:00:00Z"),
        datePrecision: "MONTH",
      }),
    ).rejects.toThrow(/signers_month_is_first_day/);
    await expect(
      signer({ signedOn: new Date("2026-04-02T00:00:00Z") }),
    ).rejects.toThrow(/signers_date_precision_pair/);
    await expect(signer({ datePrecision: "DAY" })).rejects.toThrow(
      /signers_date_precision_pair/,
    );
  });

  it("has the (shop, createdAt DESC, id DESC) index", async () => {
    const rows = await prisma.$queryRaw<
      { indexdef: string }[]
    >`SELECT indexdef FROM pg_indexes WHERE tablename = 'certificates'`;
    expect(rows.map((row) => row.indexdef).join("\n")).toMatch(
      /\(shop, created_at DESC, id DESC\)/,
    );
  });
});
