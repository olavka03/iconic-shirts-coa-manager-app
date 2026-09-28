import prisma from "~/.server/db/prisma.singleton";
import { excluding, SIGNER_NAMES } from "./certificate-mapping.utils";
import type { CodeHistoryRow } from "./certificate.types";

export async function findCodeOwner(
  shop: string,
  code: string,
  excludeId?: string,
): Promise<{ id: string; item: string; signerNames: string[] } | null> {
  const owner = await prisma.certificate.findFirst({
    where: { shop, code, ...excluding(excludeId) },
    select: { id: true, item: true, signers: SIGNER_NAMES },
  });

  return owner
    ? {
        id: owner.id,
        item: owner.item,
        signerNames: owner.signers.map((signer) => signer.name),
      }
    : null;
}

export async function codeHistory(shop: string): Promise<CodeHistoryRow[]> {
  const rows = await prisma.certificate.findMany({
    where: { shop },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      code: true,
      item: true,
      orderName: true,
      productId: true,
      signers: SIGNER_NAMES,
    },
  });

  return rows.map(({ signers, ...columns }) => ({
    ...columns,
    signerNames: signers.map((signer) => signer.name),
  }));
}

type HistorySummary = {
  total: bigint;
  latestUpdate: Date | null;
  latestId: string | null;
};

// Postgres has no max(uuid); v7 ids sort by creation time as text, so the text maximum is the newest.
export async function historyStamp(shop: string): Promise<string> {
  const [summary] = await prisma.$queryRaw<HistorySummary[]>`
    SELECT count(*) AS total, max(updated_at) AS "latestUpdate", max(id::text) AS "latestId"
    FROM certificates WHERE shop = ${shop}`;
  const latestUpdate = summary.latestUpdate?.toISOString() ?? "";

  return `${summary.total}:${latestUpdate}:${summary.latestId ?? ""}`;
}

export async function codesContaining(
  shop: string,
  token: string,
  excludeId?: string,
): Promise<string[]> {
  // Prisma doesn't escape LIKE wildcards, so only a plain [A-Z0-9] token may reach contains.
  if (!/^[A-Z0-9]+$/.test(token)) {
    return [];
  }

  const rows = await prisma.certificate.findMany({
    where: { shop, code: { contains: token }, ...excluding(excludeId) },
    orderBy: { code: "asc" },
    select: { code: true },
  });

  return rows.map((row) => row.code);
}

export async function listCodes(shop: string): Promise<string[]> {
  const rows = await prisma.certificate.findMany({
    where: { shop },
    orderBy: { code: "asc" },
    select: { code: true },
  });

  return rows.map((row) => row.code);
}
