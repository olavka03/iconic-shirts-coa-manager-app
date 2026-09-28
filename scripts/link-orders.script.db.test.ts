import { readFileSync } from "node:fs";
import { Kind, parse, visit } from "graphql";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setSleepForTests } from "~/.server/gateways/admin-graphql.gateway";
import prisma from "~/.server/db/prisma.singleton";
import type { CertificateWrite } from "~/.server/repositories/certificate.types";
import { dropCodeDictionary } from "~/.server/services/codes/codes.service";
import { flushBackgroundMirrors } from "~/.server/services/mirror/mirror-background.service";
import { resetMirrorMemos } from "~/.server/services/mirror/mirror-sync.service";
import { clearShopInfoCache } from "~/.server/services/shop/shop-info.service";
import { createFakeAdmin, type FakeAdmin } from "../tests/fakes/admin-api.fake";
import type { FakeLineItem, FakeOrder } from "../tests/fakes/orders.fake";
import {
  createCertificateRow,
  SHOP,
} from "../tests/helpers/certificate-row.factory";
import { runLinkOrders } from "./link-orders.script";
import type {
  LinkDependencies,
  LinkReport,
} from "./link-orders/link-orders.types";
import { defaultLinkReportPath } from "./link-orders/link-orders-report.utils";

const RUN_AT = new Date("2026-09-28T12:00:00.000Z");
const CDN = "https://cdn.shopify.com/s/files/1/0000/0001/files";
const HENRY_TITLE = "Thierry Henry Signed Arsenal 2003-04 Home Shirt";
const GULER_TITLE = "Arda Güler Signed Real Madrid 2026/27 Home Football Shirt";
const BERGKAMP_0405 =
  "Dennis Bergkamp Signed Arsenal FC Original 2004–05 Away Shirt";
const BERGKAMP_0304 =
  "Dennis Bergkamp Signed Arsenal FC Original 2003–04 Away Shirt";

let fake: FakeAdmin;
let output: string[];
let reports: Map<string, string>;

const lineItemId = (suffix: string) => `gid://shopify/LineItem/9${suffix}`;
const person = (name: string) => ({ name, date: null, location: null });

function lineItem(
  suffix: string,
  title: string,
  currentQuantity = 1,
): FakeLineItem {
  return {
    id: lineItemId(suffix),
    title,
    variantTitle: null,
    currentQuantity,
    isGiftCard: false,
    imageUrl: `${CDN}/li-${suffix}.jpg`,
    product: {
      id: `gid://shopify/Product/9${suffix}`,
      title,
      status: "ACTIVE",
      imageUrl: `${CDN}/p-${suffix}.jpg`,
    },
  };
}

function order(orderNumber: string, lineItems: FakeLineItem[]): FakeOrder {
  return {
    id: `gid://shopify/Order/9${orderNumber}`,
    name: `#${orderNumber}`,
    createdAt: "2026-09-01T10:00:00Z",
    cancelledAt: null,
    displayFulfillmentStatus: "FULFILLED",
    lineItems,
  };
}

function testOrders(): FakeOrder[] {
  return [
    order("141909", [lineItem("1", HENRY_TITLE)]),
    order("141855", [
      lineItem("21", BERGKAMP_0405),
      lineItem("22", BERGKAMP_0304),
    ]),
    order("141638", [
      lineItem(
        "31",
        "Robert Lewandowski Signed Borussia Dortmund 2011-12 Home Shirt",
      ),
      lineItem(
        "32",
        "Robert Lewandowski Signed FC Barcelona 2022-23 Home Shirt",
      ),
      lineItem(
        "33",
        "Robert Lewandowski Signed Bayern Munich 2015-16 Home Shirt",
      ),
    ]),
    order("141004", [lineItem("4", GULER_TITLE, 2)]),
    order("141777", [lineItem("5", HENRY_TITLE)]),
  ];
}

function dependencies(): LinkDependencies {
  return {
    adminForShop: async (shop) => ({ shop, admin: fake.client }),
    now: () => new Date(RUN_AT),
    print: (line) => output.push(line),
    writeFile: async (path, content) => {
      reports.set(path, content);
    },
  };
}

const runLink = (...flags: string[]) =>
  runLinkOrders(["--shop", SHOP, ...flags], dependencies());

function lastReport(): LinkReport {
  const content = [...reports.values()].at(-1);

  if (content === undefined) {
    throw new Error("No report was written.");
  }

  return JSON.parse(content) as LinkReport;
}

function imported(
  code: string,
  orderName: string,
  item: string,
  signer: string,
  overrides: Partial<CertificateWrite> = {},
) {
  return createCertificateRow({
    code,
    item,
    orderName,
    signers: [person(signer)],
    ...overrides,
  });
}

const linkColumns = (code: string) =>
  prisma.certificate.findUniqueOrThrow({
    where: { shop_code: { shop: SHOP, code } },
    select: {
      orderId: true,
      orderName: true,
      lineItemId: true,
      lineItemTitle: true,
      productId: true,
      productTitle: true,
      productImageUrl: true,
      version: true,
      updatedAt: true,
    },
  });

const lineItemOf = async (code: string) => (await linkColumns(code)).lineItemId;

const plannedCodes = (report: LinkReport) =>
  report.links.map((link) => [link.certificateCode, link.columns.lineItemId]);

const issueCodes = (report: LinkReport) =>
  report.issues.map((issue) => [issue.certificateCode, issue.code]);

beforeEach(() => {
  fake = createFakeAdmin({ orders: testOrders() });
  output = [];
  reports = new Map();
  resetMirrorMemos();
  clearShopInfoCache();
  dropCodeDictionary(SHOP);
  setSleepForTests(async () => {});
});

afterEach(async () => {
  await flushBackgroundMirrors();
  setSleepForTests(null);
});

describe("link-orders CLI", () => {
  it("dry run plans a unique match and writes nothing", async () => {
    const henry = await imported(
      "IS141909ARS0",
      "#141909",
      "Arsenal Home Shirt 2003-04",
      "Thierry Henry",
    );
    const before = await linkColumns("IS141909ARS0");

    expect(await runLink()).toBe(0);

    const report = lastReport();

    expect(await linkColumns("IS141909ARS0")).toEqual(before);
    expect(await prisma.syncFailure.count()).toBe(0);
    expect(fake.callsTo("CoaCertificateUpsert")).toHaveLength(0);
    expect(reports.has(defaultLinkReportPath("dry-run", RUN_AT))).toBe(true);
    expect(report.summary).toMatchObject({
      candidates: 1,
      ordersQueried: 1,
      toLink: 1,
      linked: 0,
    });
    expect(report.links).toEqual([
      {
        certificateCode: henry.code,
        outcome: "planned",
        columns: {
          orderId: "gid://shopify/Order/9141909",
          orderName: "#141909",
          lineItemId: lineItemId("1"),
          lineItemTitle: HENRY_TITLE,
          productId: "gid://shopify/Product/91",
          productTitle: HENRY_TITLE,
          productImageUrl: `${CDN}/p-1.jpg`,
        },
      },
    ]);
    expect(output.join("\n")).toContain(
      `To link (1):\n  IS141909ARS0 → #141909 · ${HENRY_TITLE}`,
    );
    expect(fake.callsTo("CoaOrderByName")[0].variables.query).toBe(
      "(status:open OR status:closed OR status:cancelled) AND (name:141909 OR name:#141909)",
    );
  });

  it("--apply writes the link and product, keeps updatedAt and pushes the mirror once", async () => {
    await imported(
      "IS141909ARS0",
      "#141909",
      "Arsenal Home Shirt 2003-04",
      "Thierry Henry",
    );
    const before = await linkColumns("IS141909ARS0");

    expect(await runLink("--apply")).toBe(0);

    expect(await linkColumns("IS141909ARS0")).toEqual({
      orderId: "gid://shopify/Order/9141909",
      orderName: "#141909",
      lineItemId: lineItemId("1"),
      lineItemTitle: HENRY_TITLE,
      productId: "gid://shopify/Product/91",
      productTitle: HENRY_TITLE,
      productImageUrl: `${CDN}/p-1.jpg`,
      version: before.version + 1,
      updatedAt: before.updatedAt,
    });
    expect(fake.callsTo("CoaCertificateUpsert")).toHaveLength(1);
    expect(await prisma.syncFailure.count()).toBe(0);
    expect(lastReport().links.map((link) => link.outcome)).toEqual(["linked"]);
    expect(output).toContain("Linked 1 certificate.");
    expect(reports.has(defaultLinkReportPath("apply", RUN_AT))).toBe(true);
  });

  it("links a deleted product's item with empty product columns", async () => {
    fake.orders[0].lineItems[0].product = null;
    await imported(
      "IS141909ARS0",
      "#141909",
      "Arsenal Home Shirt 2003-04",
      "Thierry Henry",
    );

    expect(await runLink("--apply")).toBe(0);

    expect(await linkColumns("IS141909ARS0")).toMatchObject({
      lineItemId: lineItemId("1"),
      productId: null,
      productTitle: null,
      productImageUrl: null,
    });
  });

  it("links one player's shirts from different seasons of one club to their own items", async () => {
    await imported(
      "IS141855DBA45",
      "#141855",
      "Arsenal Away Shirt 2004-05",
      "Dennis Bergkamp",
    );
    await imported(
      "IS141855DBA34",
      "#141855",
      "Arsenal Away Shirt 2003-04",
      "Dennis Bergkamp",
    );

    expect(await runLink("--apply")).toBe(0);

    expect(await lineItemOf("IS141855DBA45")).toBe(lineItemId("21"));
    expect(await lineItemOf("IS141855DBA34")).toBe(lineItemId("22"));
  });

  it("links one player's shirts from different clubs to their own items", async () => {
    await imported(
      "IS141638RLBD",
      "#141638",
      "Borussia Dortmund Home Shirt 2011-12",
      "Robert Lewandowski",
    );
    await imported(
      "IS141638RLFB",
      "#141638",
      "FC Barcelona Home Shirt 2022-23",
      "Robert Lewandowski",
    );
    await imported(
      "IS141638RLBM",
      "#141638",
      "Bayern Munich Home Shirt 2015-16",
      "Robert Lewandowski",
    );

    expect(await runLink()).toBe(0);

    expect(plannedCodes(lastReport())).toEqual([
      ["IS141638RLBD", lineItemId("31")],
      ["IS141638RLFB", lineItemId("32")],
      ["IS141638RLBM", lineItemId("33")],
    ]);
  });

  it("links two certificates to an item with quantity 2", async () => {
    await imported(
      "IS141004RM1",
      "#141004",
      "Real Madrid 2026/27 Home Football Shirt",
      "Arda Güler",
    );
    await imported(
      "IS141004RM2",
      "#141004",
      "Real Madrid 2026/27 Home Football Shirt",
      "Arda Güler",
    );

    expect(await runLink("--apply")).toBe(0);

    expect(await lineItemOf("IS141004RM1")).toBe(lineItemId("4"));
    expect(await lineItemOf("IS141004RM2")).toBe(lineItemId("4"));
    expect(fake.callsTo("CoaCertificateUpsert")).toHaveLength(2);
  });

  it("leaves ambiguous, unmatched and unknown-order certificates alone", async () => {
    await imported(
      "IS141855DBA",
      "#141855",
      "Arsenal Away Shirt",
      "Dennis Bergkamp",
    );
    await imported(
      "IS141909THFR",
      "#141909",
      "France Home Shirt 1998",
      "Thierry Henry",
    );
    await imported(
      "IS141999ARS",
      "#141999",
      "Arsenal Home Shirt 2003-04",
      "Thierry Henry",
    );

    expect(await runLink("--apply")).toBe(0);

    const report = lastReport();

    expect(issueCodes(report)).toEqual([
      ["IS141855DBA", "AMBIGUOUS"],
      ["IS141909THFR", "NO_MATCH"],
      ["IS141999ARS", "ORDER_NOT_FOUND"],
    ]);
    expect(report.summary.issues).toEqual({
      AMBIGUOUS: 1,
      NO_MATCH: 1,
      ORDER_NOT_FOUND: 1,
      CAPACITY_FULL: 0,
      ACCESS_DENIED: 0,
    });
    expect(
      await prisma.certificate.count({ where: { orderId: { not: null } } }),
    ).toBe(0);
    expect(output).toContain("Mirror: nothing to push.");
  });

  it("skips linked certificates and respects the item's capacity", async () => {
    await createCertificateRow({
      code: "IS141777ARS1",
      item: "Arsenal Home Shirt 2003-04",
      orderId: "gid://shopify/Order/9141777",
      orderName: "#141777",
      lineItemId: lineItemId("5"),
      lineItemTitle: HENRY_TITLE,
      signers: [person("Thierry Henry")],
    });
    await imported(
      "IS141777ARS2",
      "#141777",
      "Arsenal Home Shirt 2003-04",
      "Thierry Henry",
    );

    expect(await runLink("--apply")).toBe(0);

    const report = lastReport();

    expect(report.summary.candidates).toBe(1);
    expect(issueCodes(report)).toEqual([["IS141777ARS2", "CAPACITY_FULL"]]);
    expect(await lineItemOf("IS141777ARS2")).toBeNull();
  });

  it("stops at an access error and writes nothing", async () => {
    await imported(
      "IS141909ARS0",
      "#141909",
      "Arsenal Home Shirt 2003-04",
      "Thierry Henry",
    );
    await imported(
      "IS141004RM1",
      "#141004",
      "Real Madrid 2026/27 Home Football Shirt",
      "Arda Güler",
    );
    fake.failNext("CoaOrderByName", { throw: "access_denied" });

    expect(await runLink("--apply")).toBe(1);

    const report = lastReport();

    expect(fake.callsTo("CoaOrderByName")).toHaveLength(1);
    expect(report.summary.issues.ACCESS_DENIED).toBe(2);
    expect(report.links).toEqual([]);
    expect(
      await prisma.certificate.count({ where: { orderId: { not: null } } }),
    ).toBe(0);
    expect(fake.callsTo("CoaCertificateUpsert")).toHaveLength(0);
  });

  it("selects no customer fields in the order search", () => {
    const source = readFileSync(
      new URL("../app/.server/gateways/orders.gateway.ts", import.meta.url),
      "utf8",
    );
    const body = /`#graphql(\s*query CoaOrderByName[\s\S]*?)`/.exec(
      source,
    )?.[1];
    const fields: string[] = [];

    visit(parse(body ?? ""), {
      Field: (node) => {
        if (node.kind === Kind.FIELD) {
          fields.push(node.name.value);
        }
      },
    });

    expect(fields.sort()).toEqual(
      [
        "orders",
        "nodes",
        "id",
        "name",
        "lineItems",
        "nodes",
        "id",
        "title",
        "currentQuantity",
        "isGiftCard",
        "product",
        "id",
        "title",
        "featuredMedia",
        "preview",
        "image",
        "url",
        "pageInfo",
        "hasNextPage",
      ].sort(),
    );
  });
});
