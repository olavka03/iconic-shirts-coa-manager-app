import type { Prisma } from "@prisma/client";
import prisma from "~/.server/db/prisma.singleton";
import {
  hasActiveFilters,
  type ListParams,
  type Presence,
} from "~/features/certificates/utils/list-params.utils";
import { searchTokens } from "~/features/certificates/utils/search-text.utils";
import {
  mediaPresenceWhere,
  SIGNERS,
  toSigner,
} from "./certificate-mapping.utils";
import type { ListRow } from "./certificate.types";

const PHOTO_FILTERS: Record<Presence, Prisma.CertificateWhereInput> = {
  yes: mediaPresenceWhere("photo", "yes"),
  no: mediaPresenceWhere("photo", "no"),
};

const VIDEO_FILTERS: Record<Presence, Prisma.CertificateWhereInput> = {
  yes: mediaPresenceWhere("video", "yes"),
  no: mediaPresenceWhere("video", "no"),
};

function signedFilter(
  from: string | null,
  to: string | null,
): Prisma.CertificateWhereInput[] {
  if (from === null && to === null) {
    return [];
  }

  const utcMidnight = (isoDate: string | null) =>
    isoDate === null ? undefined : new Date(`${isoDate}T00:00:00Z`);
  const lastDay = utcMidnight(to);

  // A MONTH date is stored as the 1st, so it overlaps a range that starts later in that month.
  return [
    {
      signers: {
        some: {
          OR: [
            {
              datePrecision: "DAY",
              signedOn: { gte: utcMidnight(from), lte: lastDay },
            },
            {
              datePrecision: "MONTH",
              signedOn: {
                gte: utcMidnight(
                  from === null ? null : `${from.slice(0, 7)}-01`,
                ),
                lte: lastDay,
              },
            },
          ],
        },
      },
    },
  ];
}

function listOrder(
  listParams: ListParams,
): Prisma.CertificateOrderByWithRelationInput[] {
  const direction = listParams.direction;

  switch (listParams.sort) {
    case "created":
      return [{ createdAt: direction }, { id: direction }];
    case "updated":
      return [{ updatedAt: direction }, { id: direction }];
    case "signed":
      return [
        { latestSignedOn: { sort: direction, nulls: "last" } },
        { createdAt: "desc" },
        { id: "desc" },
      ];
    case "code":
      return [{ code: direction }];
  }
}

function listWhere(
  shop: string,
  listParams: ListParams,
): Prisma.CertificateWhereInput {
  return {
    shop,
    AND: [
      ...searchTokens(listParams.query).map((token) => ({
        searchText: { contains: token },
      })),
      ...(listParams.photo ? [PHOTO_FILTERS[listParams.photo]] : []),
      ...(listParams.video ? [VIDEO_FILTERS[listParams.video]] : []),
      ...signedFilter(listParams.signedFrom, listParams.signedTo),
    ],
  };
}

async function shopHasNoCertificates(shop: string): Promise<boolean> {
  const anyCertificate = await prisma.certificate.findFirst({
    where: { shop },
    select: { id: true },
  });

  return anyCertificate === null;
}

export async function listCertificates(
  shop: string,
  listParams: ListParams,
): Promise<{
  rows: ListRow[];
  total: number;
  page: number;
  pageCount: number;
  storeIsEmpty: boolean;
}> {
  const where = listWhere(shop, listParams);
  const total = await prisma.certificate.count({ where });
  const { perPage } = listParams;
  const pageCount = Math.ceil(total / perPage);
  const page = Math.min(Math.max(listParams.page, 1), Math.max(pageCount, 1));
  const rows =
    total === 0
      ? []
      : await prisma.certificate.findMany({
          where,
          orderBy: listOrder(listParams),
          skip: (page - 1) * perPage,
          take: perPage,
          select: {
            id: true,
            code: true,
            item: true,
            orderName: true,
            photoUrl: true,
            photoFileId: true,
            videoUrl: true,
            videoFileId: true,
            photoError: true,
            videoError: true,
            productImageUrl: true,
            signers: SIGNERS,
          },
        });
  const filtered = listParams.query !== "" || hasActiveFilters(listParams);
  const storeIsEmpty =
    total === 0 && (!filtered || (await shopHasNoCertificates(shop)));

  return {
    rows: rows.map((row) => ({ ...row, signers: row.signers.map(toSigner) })),
    total,
    page,
    pageCount,
    storeIsEmpty,
  };
}
