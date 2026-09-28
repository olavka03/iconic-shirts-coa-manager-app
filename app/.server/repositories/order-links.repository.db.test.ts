import { describe, expect, it } from "vitest";
import prisma from "~/.server/db/prisma.singleton";
import {
  createCertificateRow,
  linkedWrite,
  OTHER_SHOP,
  SHOP,
} from "../../../tests/helpers/certificate-row.factory";
import { LINE_ITEM_IDS, ORDER_IDS } from "../../../tests/fakes/orders.fake";
import {
  certificatesByLineItems,
  certificatesForOrder,
  countByOrders,
  countForLineItem,
  getOrderLink,
  lockLineItem,
} from "./order-links.repository";

const at = (dayOfJanuary: number) =>
  new Date(Date.UTC(2026, 0, dayOfJanuary, 12));
const sleep = (durationMs: number) =>
  new Promise((resolve) => setTimeout(resolve, durationMs));
const person = (name: string) => ({ name, date: null, location: null });

// Order #141002: one legacy certificate (name only) and three linked ones, two on the Bayern item.
async function seed() {
  const legacy = await createCertificateRow(
    {
      code: "IS141002PL",
      item: "Bayern Munich Home Shirt 2013-14",
      orderName: "#141002",
      signers: [person("Philipp Lahm")],
    },
    { createdAt: at(1) },
  );
  const bayern = await createCertificateRow(linkedWrite(), {
    createdAt: at(2),
  });
  const dortmund = await createCertificateRow(
    linkedWrite({
      code: "IS141002BVB1213",
      item: "Borussia Dortmund Home Shirt 2012-13",
      lineItemId: LINE_ITEM_IDS.dortmund,
      lineItemTitle: "Signed Borussia Dortmund Home Shirt 2012-13",
      signers: [person("Marco Reus"), person("Mats Hummels")],
    }),
    { createdAt: at(3) },
  );
  const arsenal = await createCertificateRow(
    linkedWrite({
      code: "IS141003ARS0405",
      item: "Arsenal Home Shirt 2004-05",
      orderId: ORDER_IDS.order141003,
      orderName: "#141003",
      lineItemId: LINE_ITEM_IDS.arsenal0405,
      lineItemTitle: "Signed Arsenal Home Shirt 2004-05",
      signers: [person("Thierry Henry")],
    }),
    { createdAt: at(4) },
  );
  const bayern2 = await createCertificateRow(
    linkedWrite({ code: "IS141002RLBM1516-2" }),
    { createdAt: at(5) },
  );
  const legacy3 = await createCertificateRow(
    {
      code: "IS141003DB",
      orderName: "#141003",
      signers: [person("Dennis Bergkamp")],
    },
    { createdAt: at(6) },
  );
  await createCertificateRow(linkedWrite(), { shop: OTHER_SHOP });
  await createCertificateRow(
    { code: "IS141002PL", orderName: "#141002" },
    { shop: OTHER_SHOP },
  );

  return { legacy, bayern, dortmund, arsenal, bayern2, legacy3 };
}

describe("order links", () => {
  it("certificatesByLineItems groups by line item and leaves out excludeId", async () => {
    const seeded = await seed();
    const ids = [
      LINE_ITEM_IDS.bayern,
      LINE_ITEM_IDS.dortmund,
      LINE_ITEM_IDS.guler,
    ];

    expect(await certificatesByLineItems(SHOP, ids)).toEqual(
      new Map([
        [
          LINE_ITEM_IDS.bayern,
          [
            { id: seeded.bayern.id, code: "IS141002RLBM1516" },
            { id: seeded.bayern2.id, code: "IS141002RLBM1516-2" },
          ],
        ],
        [
          LINE_ITEM_IDS.dortmund,
          [{ id: seeded.dortmund.id, code: "IS141002BVB1213" }],
        ],
        [LINE_ITEM_IDS.guler, []],
      ]),
    );
    expect(
      (await certificatesByLineItems(SHOP, ids, seeded.bayern.id)).get(
        LINE_ITEM_IDS.bayern,
      ),
    ).toEqual([{ id: seeded.bayern2.id, code: "IS141002RLBM1516-2" }]);
    expect(await certificatesByLineItems(SHOP, [])).toEqual(new Map());
  });

  it("certificatesForOrder with an order id lists linked and legacy certificates, oldest first", async () => {
    const seeded = await seed();
    const order = { orderId: ORDER_IDS.order141002, orderName: "#141002" };

    expect(await certificatesForOrder(SHOP, order)).toEqual([
      {
        id: seeded.legacy.id,
        code: "IS141002PL",
        item: "Bayern Munich Home Shirt 2013-14",
        signerNames: ["Philipp Lahm"],
        orderId: null,
        lineItemId: null,
      },
      {
        id: seeded.bayern.id,
        code: "IS141002RLBM1516",
        item: "Bayern Munich Football Shirt - 2015-16 Home",
        signerNames: ["Robert Lewandowski"],
        orderId: ORDER_IDS.order141002,
        lineItemId: LINE_ITEM_IDS.bayern,
      },
      {
        id: seeded.dortmund.id,
        code: "IS141002BVB1213",
        item: "Borussia Dortmund Home Shirt 2012-13",
        signerNames: ["Marco Reus", "Mats Hummels"],
        orderId: ORDER_IDS.order141002,
        lineItemId: LINE_ITEM_IDS.dortmund,
      },
      {
        id: seeded.bayern2.id,
        code: "IS141002RLBM1516-2",
        item: "Bayern Munich Football Shirt - 2015-16 Home",
        signerNames: ["Robert Lewandowski"],
        orderId: ORDER_IDS.order141002,
        lineItemId: LINE_ITEM_IDS.bayern,
      },
    ]);
    expect(
      (await certificatesForOrder(SHOP, order, seeded.bayern.id)).map(
        (certificate) => certificate.id,
      ),
    ).toEqual([seeded.legacy.id, seeded.dortmund.id, seeded.bayern2.id]);
    expect(
      (
        await certificatesForOrder(SHOP, {
          orderId: ORDER_IDS.order141002,
          orderName: null,
        })
      ).map((certificate) => certificate.id),
    ).toEqual([seeded.bayern.id, seeded.dortmund.id, seeded.bayern2.id]);
  });

  it("certificatesForOrder without an order id (a legacy page) lists every certificate with that name", async () => {
    const seeded = await seed();

    expect(
      (
        await certificatesForOrder(SHOP, {
          orderId: null,
          orderName: "#141003",
        })
      ).map((certificate) => certificate.id),
    ).toEqual([seeded.arsenal.id, seeded.legacy3.id]);
    expect(
      (
        await certificatesForOrder(
          SHOP,
          { orderId: null, orderName: "#141003" },
          seeded.legacy3.id,
        )
      ).map((certificate) => certificate.id),
    ).toEqual([seeded.arsenal.id]);
    expect(
      await certificatesForOrder(SHOP, { orderId: null, orderName: null }),
    ).toEqual([]);
  });

  it("countByOrders counts linked certificates by id and legacy ones by name", async () => {
    await seed();

    expect(
      await countByOrders(SHOP, [
        { id: ORDER_IDS.order141002, name: "#141002" },
        { id: ORDER_IDS.order141003, name: "#141003" },
        { id: ORDER_IDS.order141004, name: "#141004" },
      ]),
    ).toEqual(
      new Map([
        [ORDER_IDS.order141002, 4],
        [ORDER_IDS.order141003, 2],
        [ORDER_IDS.order141004, 0],
      ]),
    );
    expect(await countByOrders(SHOP, [])).toEqual(new Map());
  });

  it("countForLineItem counts one shop's certificates on the item, minus excludeId", async () => {
    const seeded = await seed();

    expect(await countForLineItem(prisma, SHOP, LINE_ITEM_IDS.bayern)).toBe(2);
    expect(
      await countForLineItem(
        prisma,
        SHOP,
        LINE_ITEM_IDS.bayern,
        seeded.bayern.id,
      ),
    ).toBe(1);
    expect(await countForLineItem(prisma, SHOP, LINE_ITEM_IDS.guler)).toBe(0);
    expect(
      await countForLineItem(prisma, OTHER_SHOP, LINE_ITEM_IDS.bayern),
    ).toBe(1);
  });

  it("getOrderLink returns the order and line item ids of one shop's certificate", async () => {
    const seeded = await seed();

    expect(await getOrderLink(SHOP, seeded.bayern.id)).toEqual({
      orderId: ORDER_IDS.order141002,
      lineItemId: LINE_ITEM_IDS.bayern,
    });
    expect(await getOrderLink(SHOP, seeded.legacy.id)).toEqual({
      orderId: null,
      lineItemId: null,
    });
    expect(await getOrderLink(OTHER_SHOP, seeded.bayern.id)).toBeNull();
  });
});

describe("lockLineItem", () => {
  async function race(secondLineItem: string, secondShop = SHOP) {
    let locked!: () => void;
    const firstLocked = new Promise<void>((resolve) => (locked = resolve));
    const first = prisma.$transaction(async (transaction) => {
      await lockLineItem(transaction, SHOP, LINE_ITEM_IDS.bayern);
      locked();
      await sleep(300);

      return Date.now();
    });
    await firstLocked;
    const secondStartedAt = Date.now();
    const second = prisma.$transaction(async (transaction) => {
      await lockLineItem(transaction, secondShop, secondLineItem);

      return Date.now();
    });
    const [firstDoneAt, secondLockedAt] = await Promise.all([first, second]);

    return { firstDoneAt, secondLockedAt, secondStartedAt };
  }

  it("serialises two transactions on the same shop and line item", async () => {
    const timings = await race(LINE_ITEM_IDS.bayern);

    expect(timings.secondLockedAt).toBeGreaterThanOrEqual(timings.firstDoneAt);
    expect(
      timings.secondLockedAt - timings.secondStartedAt,
    ).toBeGreaterThanOrEqual(200);
  });

  it("doesn't block a different line item or another shop's same item", async () => {
    const item = await race(LINE_ITEM_IDS.dortmund);

    expect(item.secondLockedAt).toBeLessThan(item.firstDoneAt);

    const shop = await race(LINE_ITEM_IDS.bayern, OTHER_SHOP);

    expect(shop.secondLockedAt).toBeLessThan(shop.firstDoneAt);
  });

  it("releases the lock when the transaction rolls back", async () => {
    await expect(
      prisma.$transaction(async (transaction) => {
        await lockLineItem(transaction, SHOP, LINE_ITEM_IDS.bayern);
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");

    const started = Date.now();
    await prisma.$transaction((transaction) =>
      lockLineItem(transaction, SHOP, LINE_ITEM_IDS.bayern),
    );

    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
