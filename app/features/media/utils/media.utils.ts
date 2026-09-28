import type {
  MediaKind,
  StoredMediaColumns,
} from "~/features/media/types/media.types";

export const URL_MAX = 2048;

export const MEDIA_KINDS = [
  "photo",
  "video",
] as const satisfies readonly MediaKind[];

export const MEDIA_FILE_TYPES: Record<MediaKind, "MediaImage" | "Video"> = {
  photo: "MediaImage",
  video: "Video",
};

export const MEDIA_MESSAGES = {
  photoType: "Upload a JPG, PNG, WEBP, or HEIC image.",
  photoSize: "This photo is larger than 20 MB.",
  photoPixels:
    "This photo is larger than 20 megapixels. Export a smaller copy and try again.",
  videoType: "Upload an MP4, MOV, or WEBM video.",
  videoDuration: "This video is longer than 10 minutes.",
  videoResolution:
    "This video's resolution is above 4K. Export a smaller copy and try again.",
  processing: "Shopify couldn't process this file. Try a different file.",
  storageFull: "Your store's file storage is full.",
  noPermission:
    "You don't have permission to upload files. Ask the store owner for access to Files.",
  fileMissing: "This file couldn't be added. Try another file.",
  pickerFailed:
    "Shopify Files couldn't be opened. Try again or add the file from a URL.",
  pickerUnavailable: "Shopify Files isn't available here. Add a URL instead.",
  urlHttps: "Enter a link that starts with https://",
  urlPhoto: "This link doesn't open an image. Check it and try again.",
  urlVideo: "This link doesn't open a video. Check it and try again.",
  brokenPhoto: "This photo couldn't be loaded. Replace it or remove it.",
} as const;

// FileErrorCode values, plus NOT_FOUND and ACCESS_DENIED for a missing file and a denied fileCreate.
const ERROR_MESSAGES: Record<string, string> = {
  VIDEO_MAX_DURATION_ERROR: MEDIA_MESSAGES.videoDuration,
  INVALID_IMAGE_RESOLUTION: MEDIA_MESSAGES.photoPixels,
  INVALID_IMAGE_FILE_SIZE: MEDIA_MESSAGES.photoSize,
  UNSUPPORTED_IMAGE_FILE_TYPE: MEDIA_MESSAGES.photoType,
  VIDEO_INVALID_FILETYPE_ERROR: MEDIA_MESSAGES.videoType,
  VIDEO_MAX_WIDTH_ERROR: MEDIA_MESSAGES.videoResolution,
  VIDEO_MAX_HEIGHT_ERROR: MEDIA_MESSAGES.videoResolution,
  FILE_STORAGE_LIMIT_EXCEEDED: MEDIA_MESSAGES.storageFull,
  NOT_FOUND: MEDIA_MESSAGES.fileMissing,
  ACCESS_DENIED: MEDIA_MESSAGES.noPermission,
};

export function mediaErrorMessage(code: string): string {
  return Object.hasOwn(ERROR_MESSAGES, code)
    ? ERROR_MESSAGES[code]
    : MEDIA_MESSAGES.processing;
}

function parseUrl(text: string): URL | null {
  try {
    return new URL(text);
  } catch {
    return null;
  }
}

export function isStorableHttpsUrl(url: string): boolean {
  return url.length <= URL_MAX && parseUrl(url)?.protocol === "https:";
}

function isShopifyFilesPath(url: URL): boolean {
  return (
    (url.hostname === "cdn.shopify.com" &&
      url.pathname.startsWith("/s/files/")) ||
    url.pathname.startsWith("/cdn/shop/files/")
  );
}

// Only Shopify's CDN paths honour the width parameter; other URLs are returned untouched.
export function thumbnailUrl(url: string, width: number): string {
  const parsed = parseUrl(url);

  if (parsed === null || !isShopifyFilesPath(parsed)) {
    return url;
  }

  parsed.searchParams.set("width", String(width));

  return parsed.toString();
}

export function mediaKindOfFileId(id: string): MediaKind | null {
  const fileType = /^gid:\/\/shopify\/(\w+)\/\d+$/.exec(id)?.[1];

  return (
    MEDIA_KINDS.find((kind) => MEDIA_FILE_TYPES[kind] === fileType) ?? null
  );
}

type MediaFileColumns = Omit<StoredMediaColumns, "videoPreviewUrl">;

function storedFile(
  columns: MediaFileColumns,
  kind: MediaKind,
): { url: string | null; fileId: string | null } {
  return kind === "photo"
    ? { url: columns.photoUrl, fileId: columns.photoFileId }
    : { url: columns.videoUrl, fileId: columns.videoFileId };
}

export function pendingFileIdOf(
  columns: MediaFileColumns,
  kind: MediaKind,
): string | null {
  const { url, fileId } = storedFile(columns, kind);

  return url === null ? fileId : null;
}

export function pendingFileIds(columns: MediaFileColumns): string[] {
  return MEDIA_KINDS.flatMap((kind) => pendingFileIdOf(columns, kind) ?? []);
}

// A file Shopify is still processing counts as stored.
export function hasStoredMedia(
  columns: MediaFileColumns,
  kind: MediaKind,
): boolean {
  const { url, fileId } = storedFile(columns, kind);

  return url !== null || fileId !== null;
}
