const PROBE_TIMEOUT_MS = 10_000;

// Streams and some WebM recordings have no finite duration but still play, so metadata is enough.
export function canLoadVideo(
  url: string,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<boolean> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const listeners = new AbortController();
    const timer = window.setTimeout(() => finish(false), timeoutMs);

    function finish(loaded: boolean): void {
      window.clearTimeout(timer);
      listeners.abort();
      // Stops the download of a remote file once its metadata is known.
      video.removeAttribute("src");
      video.load();
      resolve(loaded);
    }

    video.preload = "metadata";
    video.muted = true;
    video.addEventListener("loadedmetadata", () => finish(true), {
      signal: listeners.signal,
    });
    video.addEventListener("error", () => finish(false), {
      signal: listeners.signal,
    });
    video.src = url;
  });
}

export function canLoadImage(
  url: string,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    const timer = window.setTimeout(() => finish(false), timeoutMs);

    function finish(loaded: boolean): void {
      window.clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      resolve(loaded);
    }

    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.src = url;
  });
}
