import prisma from "~/.server/db/prisma.singleton";
import {
  MEDIA_KINDS,
  pendingFileIds,
} from "~/features/media/utils/media.utils";
import { pendingMediaWhere } from "./certificate-mapping.utils";
import type { Db } from "~/.server/db/db.types";
import type { PendingRow } from "./certificate.types";

export async function findPendingByFileIds(
  db: Db,
  shop: string,
  fileIds: string[],
): Promise<PendingRow[]> {
  if (fileIds.length === 0) {
    return [];
  }

  return db.certificate.findMany({
    where: {
      shop,
      OR: MEDIA_KINDS.map((kind) => pendingMediaWhere(kind, fileIds)),
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      code: true,
      photoFileId: true,
      photoUrl: true,
      videoFileId: true,
      videoUrl: true,
    },
  });
}

export async function listPendingFileIds(shop: string): Promise<string[]> {
  const rows = await prisma.certificate.findMany({
    where: {
      shop,
      OR: MEDIA_KINDS.map((kind) => pendingMediaWhere(kind)),
    },
    select: {
      photoFileId: true,
      photoUrl: true,
      videoFileId: true,
      videoUrl: true,
    },
  });
  const ids = rows.flatMap((row) => pendingFileIds(row));

  return [...new Set(ids)];
}
