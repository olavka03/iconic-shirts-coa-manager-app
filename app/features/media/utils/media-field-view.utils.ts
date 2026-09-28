import type {
  MediaKind,
  MediaStatus,
  MediaValue,
} from "~/features/media/types/media.types";
import { MEDIA_MESSAGES, mediaErrorMessage } from "./media.utils";

export type Panel =
  | { name: "current" }
  | { name: "url"; checking: boolean; error: string | null }
  | { name: "adding" }
  | { name: "failed"; error: string };

export type PickView = {
  name: "pick";
  error: string | null;
  restorable: boolean;
};

export type PreviewView =
  | { name: "ready"; url: string; previewUrl: string | null }
  | { name: "broken"; url: string };

export type View =
  | PickView
  | { name: "url"; checking: boolean; error: string | null }
  | { name: "adding" }
  | { name: "processing" }
  | PreviewView;

export const CURRENT: Panel = { name: "current" };
export const ADDING: Panel = { name: "adding" };

const PICK_HINT = "Choose a file from Shopify Files or upload a new one.";

type MediaFieldCopy = {
  pickTitle: string;
  pickHint: string;
  adding: string;
  processing: string;
  processingDetails: string | null;
  ready: string;
  urlLabel: string;
  urlError: string;
  buttonLabels: {
    pick: string;
    addFromUrl: string;
    cancelReplace: string;
    addUrl: string;
    cancelUrl: string;
    replace: string;
    remove: string;
  };
};

export const MEDIA_FIELD_COPY: Record<MediaKind, MediaFieldCopy> = {
  photo: {
    pickTitle: "Add photo",
    pickHint: PICK_HINT,
    adding: "Adding photo",
    processing: "Processing photo",
    processingDetails: null,
    ready: "Photo uploaded",
    urlLabel: "Photo URL",
    urlError: MEDIA_MESSAGES.urlPhoto,
    buttonLabels: {
      pick: "Add photo from Shopify Files",
      addFromUrl: "Add from URL for the photo",
      cancelReplace: "Cancel replacing the photo",
      addUrl: "Add photo URL",
      cancelUrl: "Cancel adding a photo URL",
      replace: "Replace photo",
      remove: "Remove photo",
    },
  },
  video: {
    pickTitle: "Add video",
    pickHint: PICK_HINT,
    adding: "Adding video",
    processing: "Processing video",
    processingDetails:
      "You can save now. The video appears on your verification page when it's ready.",
    ready: "Video ready",
    urlLabel: "Video URL",
    urlError: MEDIA_MESSAGES.urlVideo,
    buttonLabels: {
      pick: "Add video from Shopify Files",
      addFromUrl: "Add from URL for the video",
      cancelReplace: "Cancel replacing the video",
      addUrl: "Add video URL",
      cancelUrl: "Cancel adding a video URL",
      replace: "Replace video",
      remove: "Remove video",
    },
  },
};

export function fileError(file: MediaStatus | undefined): string {
  return file?.status === "failed"
    ? mediaErrorMessage(file.errorCode ?? "")
    : MEDIA_MESSAGES.fileMissing;
}

export function fieldIdOf(kind: MediaKind): string {
  return `media-${kind}`;
}

export function pendingFileIdOfValue(value: MediaValue | null): string | null {
  return value?.source === "file" && value.url === null ? value.fileId : null;
}

export function panelView(panel: Panel, value: MediaValue | null): View | null {
  switch (panel.name) {
    case "failed":
      return { name: "pick", error: panel.error, restorable: value !== null };
    case "url":
    case "adding":
      return panel;
    default:
      return null;
  }
}

export function valueView(
  value: MediaValue | null,
  brokenUrl: string | null,
  serverError: string | null,
): View {
  if (value === null) {
    return { name: "pick", error: serverError, restorable: false };
  }

  if (value.url === null) {
    return { name: "processing" };
  }

  if (value.url === brokenUrl) {
    return { name: "broken", url: value.url };
  }

  return {
    name: "ready",
    url: value.url,
    previewUrl: value.source === "file" ? value.previewUrl : null,
  };
}

export function fileNameOf(url: string): string {
  try {
    const segment = new URL(url).pathname.split("/").filter(Boolean).pop();

    return segment ? decodeURIComponent(segment) : url;
  } catch {
    return url;
  }
}
