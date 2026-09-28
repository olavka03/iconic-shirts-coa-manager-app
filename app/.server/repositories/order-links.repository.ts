import type { Prisma } from "@prisma/client";
import prisma from "~/.server/db/prisma.singleton";
import { excluding, SIGNER_NAMES } from "./certificate-mapping.utils";
import type { Db, Transaction } from "~/.server/db/db.types";

// Only the four order columns and certificate references are read here, never customer data.

export type OrderCertificateRow = {
  id: string;
  code: string;
  item: string;
  signerNames: string[];
  orderId: string | null;
  lineItemId: string | null;
};

export async function certificatesByLineItems(
  shop: string,
  lineItemIds: string[],
  excludeId?: string,
): Promise<Map<string, { id: string; code: string }[]>> {
  const byLineItem = new Map<string, { id: string; code: string }[]>(
    lineItemIds.map((id) => [id, []]),
  );

  if (lineItemIds.length === 0) {
    return byLineItem;
  }

  const rows = await prisma.certificate.findMany({
    where: { shop, lineItemId: { in: lineItemIds }, ...excluding(excludeId) },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, code: true, lineItemId: true },
  });

  for (const row of rows) {
    if (row.lineItemId !== null) {
      byLineItem.get(row.lineItemId)?.push({ id: row.id, code: row.code });
    }
  }

  return byLineItem;
}

type OrderReference = { orderId: string | null; orderName: string | null };

// With an order id: linked by id plus legacy ones by name. Without one (a legacy certificate's page):
// every certificate with that name, so certificates created in the app for that order are listed too.
function orderScope(
  order: OrderReference,
): Prisma.CertificateWhereInput | null {
  if (order.orderId) {
    const legacyByName = order.orderName
      ? [{ orderId: null, orderName: order.orderName }]
      : [];

    return { OR: [{ orderId: order.orderId }, ...legacyByName] };
  }

  return order.orderName ? { orderName: order.orderName } : null;
}

export async function certificatesForOrder(
  shop: string,
  order: OrderReference,
  excludeId?: string,
): Promise<OrderCertificateRow[]> {
  const scope = orderScope(order);

  if (!scope) {
    return [];
  }

  const rows = await prisma.certificate.findMany({
    where: { shop, ...scope, ...excluding(excludeId) },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      code: true,
      item: true,
      orderId: true,
      lineItemId: true,
      signers: SIGNER_NAMES,
    },
  });

  return rows.map(({ signers, ...columns }) => ({
    ...columns,
    signerNames: signers.map((signer) => signer.name),
  }));
}

export type UnlinkedCertificateRow = {
  id: string;
  code: string;
  item: string;
  signerNames: string[];
  orderName: string;
};

// Imported certificates that name an order but aren't linked to it yet.
export async function unlinkedNamedCertificates(
  shop: string,
): Promise<UnlinkedCertificateRow[]> {
  const rows = await prisma.certificate.findMany({
    where: { shop, orderId: null, orderName: { not: null } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      code: true,
      item: true,
      orderName: true,
      signers: SIGNER_NAMES,
    },
  });

  return rows.flatMap(({ signers, orderName, ...columns }) =>
    orderName === null
      ? []
      : [
          {
            ...columns,
            orderName,
            signerNames: signers.map((signer) => signer.name),
          },
        ],
  );
}

export async function countByOrders(
  shop: string,
  orders: { id: string; name: string }[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>(orders.map((order) => [order.id, 0]));

  if (orders.length === 0) {
    return counts;
  }

  const [byId, byName] = await Promise.all([
    prisma.certificate.groupBy({
      by: ["orderId"],
      where: { shop, orderId: { in: orders.map((order) => order.id) } },
      _count: { _all: true },
    }),
    prisma.certificate.groupBy({
      by: ["orderName"],
      where: {
        shop,
        orderId: null,
        orderName: { in: orders.map((order) => order.name) },
      },
      _count: { _all: true },
    }),
  ]);
  const idByName = new Map(orders.map((order) => [order.name, order.id]));
  const add = (id: string | null | undefined, count: number) => {
    if (id) {
      counts.set(id, (counts.get(id) ?? 0) + count);
    }
  };

  for (const group of byId) {
    add(group.orderId, group._count._all);
  }

  for (const group of byName) {
    add(
      group.orderName === null ? null : idByName.get(group.orderName),
      group._count._all,
    );
  }

  return counts;
}

export function getOrderLink(
  shop: string,
  id: string,
): Promise<{ orderId: string | null; lineItemId: string | null } | null> {
  return prisma.certificate.findFirst({
    where: { id, shop },
    select: { orderId: true, lineItemId: true },
  });
}

export async function lockLineItem(
  transaction: Transaction,
  shop: string,
  lineItemId: string,
): Promise<void> {
  const key = `${shop}|${lineItemId}`;

  // Transaction-level lock, released at commit or rollback on the transaction's own connection.
  // The outer SELECT keeps Prisma from deserialising the lock function's void result.
  await transaction.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))) AS l`;
}

export function countForLineItem(
  db: Db,
  shop: string,
  lineItemId: string,
  excludeId?: string,
): Promise<number> {
  return db.certificate.count({
    where: { shop, lineItemId, ...excluding(excludeId) },
  });
}

export type OrderLinkColumns = {
  orderId: string;
  orderName: string;
  lineItemId: string;
  lineItemTitle: string;
  productId: string | null;
  productTitle: string | null;
  productImageUrl: string | null;
};

// Only a certificate that still has no order id is linked. Bookkeeping like patchSystemFields:
// updatedAt stays the merchant's last edit.
export async function setOrderLink(
  transaction: Transaction,
  shop: string,
  id: string,
  columns: OrderLinkColumns,
): Promise<{ code: string; version: number } | null> {
  const [row] = await transaction.certificate.updateManyAndReturn({
    where: { id, shop, orderId: null },
    data: { ...columns, version: { increment: 1 } },
    select: { code: true, version: true },
  });

  return row ?? null;
}
