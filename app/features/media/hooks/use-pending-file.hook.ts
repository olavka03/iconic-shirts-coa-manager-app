import {
  fileError,
  pendingFileIdOfValue,
} from "~/features/media/utils/media-field-view.utils";
import type { MediaKind, MediaValue } from "~/features/media/types/media.types";
import { useFilePolling } from "./use-file-polling.hook";

export function usePendingFile(
  kind: MediaKind,
  value: MediaValue | null,
  handlers: { onReady(value: MediaValue): void; onFailed(error: string): void },
): void {
  const pendingId = pendingFileIdOfValue(value);

  useFilePolling(pendingId === null ? [] : [pendingId], {
    kind,
    enabled: pendingId !== null,
    onStatuses: (files) => {
      const file = files.find((candidate) => candidate.id === pendingId);

      if (
        value?.source !== "file" ||
        file === undefined ||
        file.status === "processing"
      ) {
        return;
      }

      if (file.status !== "ready") {
        handlers.onFailed(fileError(file));

        return;
      }

      if (file.url !== null) {
        handlers.onReady({
          ...value,
          url: file.url,
          previewUrl: file.previewUrl,
        });
      }
    },
  });
}
