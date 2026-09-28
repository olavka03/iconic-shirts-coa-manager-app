import { useEffect } from "react";
import type {
  FilesStatusResponse,
  MediaStatus,
} from "~/features/media/types/media.types";
import {
  isNetworkFailure,
  requestJson,
} from "~/shared/utils/json-request.utils";
import { useLatest } from "~/shared/hooks/use-latest.hook";
import { mediaKindOfFileId } from "~/features/media/utils/media.utils";

export type PollingKind = "photo" | "video" | "mixed";

export type FilePollingOptions = {
  kind: PollingKind;
  onStatuses(files: MediaStatus[]): void;
  enabled: boolean;
};

const PHOTO_INTERVAL_MS = 1_000;
const SLOW_INTERVAL_MS = 5_000;
const PHOTO_FAST_WINDOW_MS = 60_000;
const IDS_PER_REQUEST = 10;

function inBatches(ids: string[]): string[][] {
  return Array.from(
    { length: Math.ceil(ids.length / IDS_PER_REQUEST) },
    (_unused, index) =>
      ids.slice(index * IDS_PER_REQUEST, (index + 1) * IDS_PER_REQUEST),
  );
}

async function fetchBatch(
  ids: string[],
  signal?: AbortSignal,
): Promise<MediaStatus[] | null> {
  const query = new URLSearchParams({ ids: ids.join(",") });
  const result = await requestJson<FilesStatusResponse>(`/api/files?${query}`, {
    signal,
  });

  return isNetworkFailure(result) || !("files" in result) ? null : result.files;
}

// null when any request failed; callers retry on their next attempt.
export async function fetchFileStatuses(
  ids: string[],
  signal?: AbortSignal,
): Promise<MediaStatus[] | null> {
  const batches = await Promise.all(
    inBatches(ids).map((batch) => fetchBatch(batch, signal)),
  );
  const files: MediaStatus[] = [];

  for (const batch of batches) {
    if (batch === null) {
      return null;
    }

    files.push(...batch);
  }

  return files;
}

function pollInterval(
  kind: PollingKind,
  ids: string[],
  elapsedMs: number,
): number {
  const hasPhoto =
    kind === "photo" ||
    (kind === "mixed" && ids.some((id) => mediaKindOfFileId(id) === "photo"));

  return hasPhoto && elapsedMs < PHOTO_FAST_WINDOW_MS
    ? PHOTO_INTERVAL_MS
    : SLOW_INTERVAL_MS;
}

export function useFilePolling(
  ids: string[],
  options: FilePollingOptions,
): void {
  const { kind, enabled } = options;
  const latestOnStatuses = useLatest(options.onStatuses);
  const idsKey = ids.join(",");

  useEffect(() => {
    const polled = idsKey === "" ? [] : idsKey.split(",");

    if (!enabled || polled.length === 0) {
      return;
    }

    const controller = new AbortController();
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;

    function scheduleNext(): void {
      timer = setTimeout(
        poll,
        pollInterval(kind, polled, Date.now() - startedAt),
      );
    }

    async function poll(): Promise<void> {
      const files = await fetchFileStatuses(polled, controller.signal);

      if (controller.signal.aborted) {
        return;
      }

      if (files !== null) {
        latestOnStatuses.current(files);
      }

      scheduleNext();
    }

    scheduleNext();

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [enabled, idsKey, kind, latestOnStatuses]);
}
