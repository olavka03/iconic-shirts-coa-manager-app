import type { ErrorBody } from "~/shared/types/api.types";

export type MediaKind = "photo" | "video";

export type MediaInput =
  { source: "file"; fileId: string } | { source: "url"; url: string };

export type StoredMediaColumns = {
  photoUrl: string | null;
  photoFileId: string | null;
  videoUrl: string | null;
  videoFileId: string | null;
  videoPreviewUrl: string | null;
};

// url null = still processing.
export type MediaValue =
  | {
      source: "file";
      fileId: string;
      url: string | null;
      previewUrl: string | null;
    }
  | { source: "url"; url: string };

export type MediaStatus = {
  id: string;
  kind: MediaKind;
  status: "processing" | "ready" | "failed" | "missing";
  url: string | null;
  previewUrl: string | null;
  errorCode: string | null;
};

export type FilesStatusResponse = { files: MediaStatus[] } | ErrorBody;
