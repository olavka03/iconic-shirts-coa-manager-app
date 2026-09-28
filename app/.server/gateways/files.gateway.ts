import {
  adminGraphql,
  type AdminClient,
  type AdminGraphqlOptions,
} from "./admin-graphql.gateway";
import type {
  MediaKind,
  MediaStatus,
} from "~/features/media/types/media.types";
import { mediaKindOfFileId } from "~/features/media/utils/media.utils";

const FILE_STATUS = `#graphql
  query CoaFileStatus($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on MediaImage {
        id
        fileStatus
        mimeType
        image {
          url
          jpgUrl: url(transform: { preferredContentType: JPG })
        }
        fileErrors {
          code
          message
        }
      }
      ... on Video {
        id
        fileStatus
        sources {
          url
          format
          height
          mimeType
        }
        originalSource {
          url
        }
        preview {
          image {
            url
          }
        }
        fileErrors {
          code
          message
        }
      }
    }
  }
` as const;

type FileNode = {
  __typename: string;
  id?: string;
  fileStatus?: string;
  mimeType?: string | null;
  image?: { url: string; jpgUrl: string } | null;
  sources?: { url: string; format: string; height: number }[];
  originalSource?: { url: string } | null;
  preview?: { image?: { url: string } | null } | null;
  fileErrors?: { code: string }[];
} | null;

export async function getFileStatuses(
  admin: AdminClient,
  ids: string[],
  options?: AdminGraphqlOptions,
): Promise<MediaStatus[]> {
  if (ids.length === 0) {
    return [];
  }

  const data = await adminGraphql(admin, FILE_STATUS, { ids }, options);

  return ids.map((id, index) => normalizeFile(id, data.nodes[index] ?? null));
}

function statusWithoutUrl(
  id: string,
  kind: MediaKind,
  status: "processing" | "failed" | "missing",
  errorCode: string | null = null,
): MediaStatus {
  return { id, kind, status, url: null, previewUrl: null, errorCode };
}

function normalizeFile(id: string, node: FileNode): MediaStatus {
  const kind = mediaKindOfFileId(id) ?? "photo";

  if (
    !node ||
    (node.__typename !== "MediaImage" && node.__typename !== "Video")
  ) {
    return statusWithoutUrl(id, kind, "missing");
  }

  if (node.fileStatus === "FAILED") {
    return statusWithoutUrl(
      id,
      kind,
      "failed",
      node.fileErrors?.[0]?.code ?? "UNKNOWN",
    );
  }

  if (node.fileStatus !== "READY") {
    return statusWithoutUrl(id, kind, "processing");
  }

  if (node.__typename === "MediaImage") {
    // A .heic URL doesn't render in Chrome or Firefox: keep the JPG transform instead.
    const url =
      (node.mimeType === "image/heic" ? node.image?.jpgUrl : node.image?.url) ??
      null;

    return {
      id,
      kind: "photo",
      status: url ? "ready" : "processing",
      url,
      previewUrl: null,
      errorCode: null,
    };
  }

  const url =
    bestVideoUrl(node.sources ?? []) ?? node.originalSource?.url ?? null;

  return {
    id,
    kind: "video",
    status: url ? "ready" : "processing",
    url,
    previewUrl: node.preview?.image?.url ?? null,
    errorCode: null,
  };
}

// Phones shouldn't stream a 4K original: the tallest MP4 up to 1080p, else the smallest MP4.
function bestVideoUrl(
  sources: { url: string; format: string; height: number }[],
): string | undefined {
  const mp4 = sources.filter((source) => source.format === "mp4");
  const upTo1080 = mp4
    .filter((source) => source.height <= 1080)
    .sort((left, right) => right.height - left.height);
  const smallest = [...mp4].sort((left, right) => left.height - right.height);

  return (upTo1080[0] ?? smallest[0])?.url;
}
