import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaStatus } from "~/features/media/types/media.types";
import {
  canLoadImage,
  canLoadVideo,
} from "~/features/media/utils/media-probe.client";
import { useFilePolling } from "./use-file-polling.hook";
import { jsonResponse } from "../../../../tests/helpers/fetch-stub.utils";

const PHOTO_ID = "gid://shopify/MediaImage/101";
const VIDEO_ID = "gid://shopify/Video/202";

type FetchStub = (url: string, requestInit?: RequestInit) => Promise<Response>;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useFilePolling", () => {
  const processing = (id: string, kind: "photo" | "video"): MediaStatus => ({
    id,
    kind,
    status: "processing",
    url: null,
    previewUrl: null,
    errorCode: null,
  });

  function stubStatuses(files: MediaStatus[]) {
    const fetchMock = vi.fn<FetchStub>(async () => jsonResponse({ files }));
    vi.stubGlobal("fetch", fetchMock);

    return fetchMock;
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("polls a photo every second", async () => {
    const fetchMock = stubStatuses([processing(PHOTO_ID, "photo")]);
    const onStatuses = vi.fn();
    renderHook(() =>
      useFilePolling([PHOTO_ID], { kind: "photo", onStatuses, enabled: true }),
    );

    await act(() => vi.advanceTimersByTimeAsync(999));
    expect(fetchMock).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `/api/files?ids=${encodeURIComponent(PHOTO_ID)}`,
    );
    expect(onStatuses).toHaveBeenCalledWith([processing(PHOTO_ID, "photo")]);

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("slows a photo down to every 5 seconds after a minute", async () => {
    const fetchMock = stubStatuses([processing(PHOTO_ID, "photo")]);
    renderHook(() =>
      useFilePolling([PHOTO_ID], {
        kind: "photo",
        onStatuses: vi.fn(),
        enabled: true,
      }),
    );

    await act(() => vi.advanceTimersByTimeAsync(60_000));
    const callsInFirstMinute = fetchMock.mock.calls.length;

    await act(() => vi.advanceTimersByTimeAsync(4_999));
    expect(fetchMock).toHaveBeenCalledTimes(callsInFirstMinute);

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(fetchMock).toHaveBeenCalledTimes(callsInFirstMinute + 1);
  });

  it("polls a video every 5 seconds", async () => {
    const fetchMock = stubStatuses([processing(VIDEO_ID, "video")]);
    renderHook(() =>
      useFilePolling([VIDEO_ID], {
        kind: "video",
        onStatuses: vi.fn(),
        enabled: true,
      }),
    );

    await act(() => vi.advanceTimersByTimeAsync(4_999));
    expect(fetchMock).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores a network failure and keeps polling", async () => {
    const fetchMock = vi
      .fn<FetchStub>(async () => jsonResponse({ files: [] }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    const onStatuses = vi.fn();
    renderHook(() =>
      useFilePolling([PHOTO_ID], { kind: "photo", onStatuses, enabled: true }),
    );

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onStatuses).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onStatuses).toHaveBeenCalledWith([]);
  });

  it("asks for at most 10 ids per request", async () => {
    const ids = Array.from(
      { length: 12 },
      (_unused, index) => `gid://shopify/Video/${index + 1}`,
    );
    const fetchMock = stubStatuses([]);
    renderHook(() =>
      useFilePolling(ids, {
        kind: "video",
        onStatuses: vi.fn(),
        enabled: true,
      }),
    );

    await act(() => vi.advanceTimersByTimeAsync(5_000));

    const requested = fetchMock.mock.calls.map(([url]) =>
      new URL(url, "https://app.test").searchParams.get("ids")!.split(","),
    );

    expect(requested).toEqual([ids.slice(0, 10), ids.slice(10)]);
  });

  it("stops when disabled or when there is nothing to poll", async () => {
    const fetchMock = stubStatuses([]);
    const { rerender } = renderHook(
      ({ ids, enabled }: { ids: string[]; enabled: boolean }) =>
        useFilePolling(ids, { kind: "photo", onStatuses: vi.fn(), enabled }),
      { initialProps: { ids: [PHOTO_ID], enabled: false } },
    );

    await act(() => vi.advanceTimersByTimeAsync(3_000));
    rerender({ ids: [], enabled: true });
    await act(() => vi.advanceTimersByTimeAsync(3_000));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops polling when it is disabled while running", async () => {
    const fetchMock = stubStatuses([processing(PHOTO_ID, "photo")]);
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useFilePolling([PHOTO_ID], {
          kind: "photo",
          onStatuses: vi.fn(),
          enabled,
        }),
      { initialProps: { enabled: true } },
    );

    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rerender({ enabled: false });
    await act(() => vi.advanceTimersByTimeAsync(10_000));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("link probes", () => {
  function captureVideos(): HTMLVideoElement[] {
    const videos: HTMLVideoElement[] = [];
    const createElement = document.createElement.bind(document);

    vi.spyOn(document, "createElement").mockImplementation(
      (tagName: string, options?: ElementCreationOptions) => {
        const element = createElement(tagName, options);

        if (element instanceof HTMLVideoElement) {
          videos.push(element);
        }

        return element;
      },
    );

    return videos;
  }

  it("accepts a video link once its metadata loads, even without a duration", async () => {
    const videos = captureVideos();
    const loads = canLoadVideo("https://cdn.example.com/signing.webm");

    expect(videos[0].preload).toBe("metadata");
    Object.defineProperty(videos[0], "duration", { value: Infinity });
    videos[0].dispatchEvent(new Event("loadedmetadata"));

    await expect(loads).resolves.toBe(true);
    expect(videos[0].hasAttribute("src")).toBe(false);
  });

  it("rejects a video link that fails to load", async () => {
    const videos = captureVideos();
    const loads = canLoadVideo("https://example.com/page.html");

    videos[0].dispatchEvent(new Event("error"));

    await expect(loads).resolves.toBe(false);
  });

  it("rejects a video link that doesn't answer within 10 seconds", async () => {
    vi.useFakeTimers();
    const loads = canLoadVideo("https://slow.example.com/signing.mp4");
    const onSettled = vi.fn();

    void loads.then(onSettled);
    await vi.advanceTimersByTimeAsync(9_999);

    expect(onSettled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    await expect(loads).resolves.toBe(false);
  });

  it("checks that a link opens an image", async () => {
    class LoadingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(url: string) {
        queueMicrotask(() =>
          url.endsWith(".jpg") ? this.onload?.() : this.onerror?.(),
        );
      }
    }

    vi.stubGlobal("Image", LoadingImage);

    await expect(canLoadImage("https://example.com/proof.jpg")).resolves.toBe(
      true,
    );
    await expect(canLoadImage("https://example.com/page.html")).resolves.toBe(
      false,
    );
  });
});
