import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  MediaFieldActions,
  MediaFieldProps,
} from "~/features/media/types/media-field.types";
import {
  canPickFiles,
  pickFile,
  subscribeToFilePicker,
} from "~/features/media/utils/file-picker.utils";
import {
  ADDING,
  CURRENT,
  fieldIdOf,
  fileError,
  MEDIA_FIELD_COPY,
  panelView,
  pendingFileIdOfValue,
  valueView,
  type Panel,
} from "~/features/media/utils/media-field-view.utils";
import {
  isStorableHttpsUrl,
  MEDIA_MESSAGES,
} from "~/features/media/utils/media.utils";
import {
  canLoadImage,
  canLoadVideo,
} from "~/features/media/utils/media-probe.client";
import { useLatest } from "~/shared/hooks/use-latest.hook";
import type { MediaKind, MediaValue } from "~/features/media/types/media.types";
import { fetchFileStatuses } from "./use-file-polling.hook";
import { useLatestAction } from "./use-latest-action.hook";
import { usePendingFile } from "./use-pending-file.hook";

async function resolvePickedFile(
  kind: MediaKind,
  fileId: string,
): Promise<MediaValue | { error: string }> {
  const files = await fetchFileStatuses([fileId]);
  const file = files?.find((candidate) => candidate.id === fileId);

  if (
    file === undefined ||
    file.kind !== kind ||
    file.status === "failed" ||
    file.status === "missing"
  ) {
    return { error: fileError(file) };
  }

  return {
    source: "file",
    fileId,
    url: file.status === "ready" ? file.url : null,
    previewUrl: file.previewUrl,
  };
}

function useBusyReport(
  blocking: boolean,
  onBusyChange: (blocking: boolean) => void,
): void {
  const report = useLatest(onBusyChange);

  useEffect(() => {
    report.current(blocking);
  }, [blocking, report]);
}

function useTokenChange(token: number, onTokenChange: () => void): void {
  const seenToken = useRef(token);
  const handler = useLatest(onTokenChange);

  useEffect(() => {
    if (seenToken.current === token) {
      return;
    }

    seenToken.current = token;
    handler.current();
  }, [token, handler]);
}

function useFocusRequest(elementId: string): () => void {
  const [request, setRequest] = useState(0);

  useEffect(() => {
    if (request > 0) {
      document.getElementById(elementId)?.focus();
    }
  }, [request, elementId]);

  return useCallback(() => setRequest((count) => count + 1), []);
}

export function useMediaField({
  kind,
  value,
  serverError,
  onChange,
  onBusyChange,
  discardToken,
}: MediaFieldProps) {
  const [panel, setPanel] = useState<Panel>(CURRENT);
  const [announcement, setAnnouncement] = useState("");
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const pickerAvailable = useSyncExternalStore(
    subscribeToFilePicker,
    canPickFiles,
    () => false,
  );
  const requestFocus = useFocusRequest(fieldIdOf(kind));
  // The media held before a pick, put back if the new file fails to process.
  const restoreOnFailure = useRef<MediaValue | null>(null);
  const latestAction = useLatestAction();
  const copy = MEDIA_FIELD_COPY[kind];
  const isPhoto = kind === "photo";

  const linkMedia = (next: MediaValue, previous: MediaValue | null) => {
    restoreOnFailure.current = previous;
    onChange(next);
    setAnnouncement("");
    setPanel(CURRENT);
  };

  const blocking = isPhoto && pendingFileIdOfValue(value) !== null;

  useBusyReport(blocking, onBusyChange);

  useTokenChange(discardToken, () => {
    latestAction.begin();
    restoreOnFailure.current = null;
    setPanel(CURRENT);
    setBrokenUrl(null);
    setAnnouncement("");
  });

  usePendingFile(kind, value, {
    onReady: (ready) => {
      restoreOnFailure.current = null;
      onChange(ready);
      setAnnouncement(copy.ready);
    },
    onFailed: (error) => {
      onChange(restoreOnFailure.current);
      restoreOnFailure.current = null;
      setPanel({ name: "failed", error });
    },
  });

  const pick = async () => {
    const started = latestAction.begin();
    const previous = value;
    const picked = await pickFile(kind);

    if (!latestAction.isCurrent(started) || picked === "closed") {
      return;
    }

    if (picked === "failed") {
      setPanel({ name: "failed", error: MEDIA_MESSAGES.pickerFailed });

      return;
    }

    setPanel(ADDING);

    const resolved = await resolvePickedFile(kind, picked.fileId);

    if (!latestAction.isCurrent(started)) {
      return;
    }

    if ("error" in resolved) {
      setPanel({ name: "failed", error: resolved.error });

      return;
    }

    linkMedia(resolved, previous);
    requestFocus();
  };

  const addUrl = async (input: string) => {
    if (panel.name !== "url" || panel.checking) {
      return;
    }

    const url = input.trim();

    if (!isStorableHttpsUrl(url)) {
      setPanel({ ...panel, error: MEDIA_MESSAGES.urlHttps });

      return;
    }

    const started = latestAction.begin();

    setPanel({ name: "url", checking: true, error: null });

    const loads = await (isPhoto ? canLoadImage(url) : canLoadVideo(url));

    if (!latestAction.isCurrent(started)) {
      return;
    }

    if (!loads) {
      setPanel({ name: "url", checking: false, error: copy.urlError });

      return;
    }

    linkMedia({ source: "url", url }, null);
    requestFocus();
  };

  const actions: MediaFieldActions = {
    pick: () => void pick(),
    openUrl: () => {
      latestAction.begin();
      setPanel({ name: "url", checking: false, error: null });
    },
    addUrl: (input) => void addUrl(input),
    editUrl: () => {
      if (panel.name === "url" && panel.error !== null) {
        setPanel({ ...panel, error: null });
      }
    },
    showCurrent: () => {
      latestAction.begin();
      setPanel(CURRENT);
      requestFocus();
    },
    remove: () => {
      latestAction.begin();
      restoreOnFailure.current = null;
      onChange(null);
      setPanel(CURRENT);
      requestFocus();
    },
    markBroken: setBrokenUrl,
  };

  return {
    view: panelView(panel, value) ?? valueView(value, brokenUrl, serverError),
    pickerAvailable,
    announcement,
    actions,
  };
}
