import {
  isAdminApiError,
  type AdminClient,
} from "~/.server/gateways/admin-graphql.gateway";
import { getFileStatuses } from "~/.server/gateways/files.gateway";
import type {
  MediaInput,
  MediaKind,
  MediaStatus,
  StoredMediaColumns,
} from "~/features/media/types/media.types";
import type { FieldErrors } from "~/shared/types/api.types";
import {
  MEDIA_MESSAGES,
  mediaErrorMessage,
} from "~/features/media/utils/media.utils";
import {
  ADMIN_READ_BUDGET_MS,
  rethrowAuth,
} from "~/.server/services/shared/admin-read.utils";

type StoredMedia = {
  url: string | null;
  fileId: string | null;
  previewUrl: string | null;
};
type MediaPlan = { media: StoredMedia } | { lookup: string };
type MediaResolution = { media: StoredMedia } | { error: string };

const NO_MEDIA: StoredMedia = { url: null, fileId: null, previewUrl: null };

async function withAuthRethrown<Result>(
  run: () => Promise<Result>,
): Promise<Result> {
  try {
    return await run();
  } catch (error) {
    rethrowAuth(error);

    throw error;
  }
}

export function getMediaStatuses(
  admin: AdminClient,
  ids: string[],
  options: { signal?: AbortSignal } = {},
): Promise<MediaStatus[]> {
  return withAuthRethrown(() =>
    getFileStatuses(admin, ids, { signal: options.signal }),
  );
}

function storedMedia(
  kind: MediaKind,
  previous: StoredMediaColumns | null,
): StoredMedia | null {
  if (previous === null) {
    return null;
  }

  return kind === "photo"
    ? { url: previous.photoUrl, fileId: previous.photoFileId, previewUrl: null }
    : {
        url: previous.videoUrl,
        fileId: previous.videoFileId,
        previewUrl: previous.videoPreviewUrl,
      };
}

function planMedia(
  value: MediaInput | null,
  stored: StoredMedia | null,
): MediaPlan {
  if (value === null) {
    return { media: NO_MEDIA };
  }

  if (value.source === "url") {
    return { media: { url: value.url, fileId: null, previewUrl: null } };
  }

  if (stored?.fileId === value.fileId && stored.url !== null) {
    return { media: stored };
  }

  return { lookup: value.fileId };
}

// A Shopify failure other than an expired session leaves the map empty: the files are stored
// pending and completed later by completePendingFiles.
async function readStatuses(
  admin: AdminClient,
  fileIds: string[],
): Promise<Map<string, MediaStatus>> {
  if (fileIds.length === 0) {
    return new Map();
  }

  try {
    const statuses = await getFileStatuses(admin, fileIds, {
      signal: AbortSignal.timeout(ADMIN_READ_BUDGET_MS),
    });

    return new Map(statuses.map((status) => [status.id, status]));
  } catch (error) {
    rethrowAuth(error);

    if (!isAdminApiError(error)) {
      throw error;
    }

    return new Map();
  }
}

function fromStatus(
  fileId: string,
  status: MediaStatus | undefined,
): MediaResolution {
  if (status?.status === "ready") {
    return {
      media: { url: status.url, fileId, previewUrl: status.previewUrl },
    };
  }

  if (status?.status === "failed") {
    return { error: mediaErrorMessage(status.errorCode ?? "") };
  }

  if (status?.status === "missing") {
    return { error: MEDIA_MESSAGES.fileMissing };
  }

  return { media: { url: null, fileId, previewUrl: null } };
}

function settle(
  plan: MediaPlan,
  statuses: Map<string, MediaStatus>,
): MediaResolution {
  return "media" in plan
    ? plan
    : fromStatus(plan.lookup, statuses.get(plan.lookup));
}

export async function resolveMediaForSave(
  admin: AdminClient,
  photo: MediaInput | null,
  video: MediaInput | null,
  previous: StoredMediaColumns | null,
): Promise<{ columns: StoredMediaColumns; fieldErrors: FieldErrors }> {
  const plans = {
    photo: planMedia(photo, storedMedia("photo", previous)),
    video: planMedia(video, storedMedia("video", previous)),
  };
  const lookups = [plans.photo, plans.video].flatMap((plan) =>
    "lookup" in plan ? [plan.lookup] : [],
  );
  const statuses = await readStatuses(admin, lookups);
  const photoResult = settle(plans.photo, statuses);
  const videoResult = settle(plans.video, statuses);
  const photoMedia = "media" in photoResult ? photoResult.media : NO_MEDIA;
  const videoMedia = "media" in videoResult ? videoResult.media : NO_MEDIA;

  return {
    columns: {
      photoUrl: photoMedia.url,
      photoFileId: photoMedia.fileId,
      videoUrl: videoMedia.url,
      videoFileId: videoMedia.fileId,
      videoPreviewUrl: videoMedia.previewUrl,
    },
    fieldErrors: {
      ...("error" in photoResult ? { photo: photoResult.error } : {}),
      ...("error" in videoResult ? { video: videoResult.error } : {}),
    },
  };
}
