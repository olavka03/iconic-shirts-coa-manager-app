import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  MediaStatus,
  MediaValue,
} from "~/features/media/types/media.types";
import type { MediaFieldProps } from "~/features/media/types/media-field.types";
import { deferred } from "../../../../tests/helpers/fetch-stub.utils";

const polling = vi.hoisted(() => ({
  ids: [] as string[],
  onStatuses: null as ((files: MediaStatus[]) => void) | null,
}));
const probes = vi.hoisted(() => ({
  canLoadImage: vi.fn(async () => true),
  canLoadVideo: vi.fn(async () => true),
}));

vi.mock(
  "~/features/media/hooks/use-file-polling.hook",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/features/media/hooks/use-file-polling.hook")
    >()),
    useFilePolling: (
      ids: string[],
      options: { onStatuses(files: MediaStatus[]): void },
    ) => {
      polling.ids = ids;
      polling.onStatuses = options.onStatuses;
    },
  }),
);
vi.mock("~/features/media/utils/media-probe.client", () => probes);

const PHOTO_ID = "gid://shopify/MediaImage/101";
const VIDEO_ID = "gid://shopify/Video/202";
const PHOTO_URL =
  "https://cdn.shopify.com/s/files/1/0001/files/IS141909PMM-photo%20front.jpg?v=12";
const PICK_HINT = "Choose a file from Shopify Files or upload a new one.";
const READY_PHOTO_STATUS: MediaStatus = {
  id: PHOTO_ID,
  kind: "photo",
  status: "ready",
  url: PHOTO_URL,
  previewUrl: null,
  errorCode: null,
};

type ShopifyTestGlobal = {
  intents?: { invoke?: (...intentArguments: unknown[]) => unknown };
};

let MediaField: typeof import("./media-field.component").MediaField;

function shopifyGlobal(): ShopifyTestGlobal {
  return (globalThis as unknown as { shopify: ShopifyTestGlobal }).shopify;
}

function renderField(props: Partial<MediaFieldProps> = {}) {
  const onChange = vi.fn();
  const onBusyChange = vi.fn();
  const allProps: MediaFieldProps = {
    kind: "photo",
    value: null,
    serverError: null,
    onChange,
    onBusyChange,
    discardToken: 0,
    ...props,
  };
  const view = render(<MediaField {...allProps} />);

  return { ...view, onChange, onBusyChange, props: allProps };
}

function pickArea(container: HTMLElement) {
  return container.querySelector<HTMLElement>('s-clickable[id^="media-"]')!;
}

function labelOf(buttonText: string) {
  return screen.getByText(buttonText).getAttribute("accessibilityLabel");
}

function pendingFile(fileId: string): MediaValue {
  return { source: "file", fileId, url: null, previewUrl: null };
}

function pickerAnswers(...responses: unknown[]) {
  const invoke = vi.fn();

  for (const response of responses) {
    invoke.mockResolvedValueOnce({ complete: Promise.resolve(response) });
  }

  shopifyGlobal().intents = { invoke };

  return invoke;
}

function stubFileStatus(status: MediaStatus) {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ files: [status] }), {
        headers: { "Content-Type": "application/json" },
      }),
  );

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

beforeEach(async () => {
  vi.clearAllMocks();
  polling.ids = [];
  polling.onStatuses = null;
  vi.resetModules();
  ({ MediaField } = await import("./media-field.component"));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MediaField, empty", () => {
  it("opens Shopify Files from the whole photo area", () => {
    const { container } = renderField();
    const area = pickArea(container);

    expect(area.id).toBe("media-photo");
    expect(area.getAttribute("accessibilityLabel")).toBe(
      "Add photo from Shopify Files",
    );
    expect(area.getAttribute("borderStyle")).toBe("dashed");
    expect(area.hasAttribute("disabled")).toBe(false);
    expect(area.textContent).toBe(`Add photo${PICK_HINT}`);
    expect(container.querySelector("s-drop-zone")).toBeNull();
    expect(screen.queryByText("Select existing")).toBeNull();
    expect(labelOf("Add from URL")).toBe("Add from URL for the photo");
  });

  it("opens Shopify Files from the whole video area", () => {
    const { container } = renderField({ kind: "video" });
    const area = pickArea(container);

    expect(area.id).toBe("media-video");
    expect(area.getAttribute("accessibilityLabel")).toBe(
      "Add video from Shopify Files",
    );
    expect(area.textContent).toBe(`Add video${PICK_HINT}`);
    expect(labelOf("Add from URL")).toBe("Add from URL for the video");
  });

  it("shows a server error under the area", () => {
    renderField({
      serverError: "This file couldn't be added. Try another file.",
    });

    expect(
      screen.getByText("This file couldn't be added. Try another file."),
    ).toBeTruthy();
  });

  it("disables the area when the admin has no file picker", () => {
    shopifyGlobal().intents = undefined;
    const { container } = renderField();

    expect(pickArea(container).hasAttribute("disabled")).toBe(true);
    expect(
      screen.getByText(
        "Shopify Files isn't available here. Add a URL instead.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Add from URL")).toBeTruthy();
  });
});

describe("MediaField, picking a file", () => {
  it("links a picked photo", async () => {
    const invoke = pickerAnswers({ code: "ok", data: { ids: [PHOTO_ID] } });
    const fetchMock = stubFileStatus(READY_PHOTO_STATUS);
    const { container, onChange } = renderField();

    fireEvent.click(pickArea(container));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        source: "file",
        fileId: PHOTO_ID,
        url: PHOTO_URL,
        previewUrl: null,
      }),
    );
    expect(invoke).toHaveBeenCalledWith("pick:shopify/File", {
      data: { mediaTypes: ["MediaImage"], multiSelect: false },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/files?ids=${encodeURIComponent(PHOTO_ID)}`,
      expect.anything(),
    );
  });

  it("changes nothing when the picker is closed", async () => {
    const invoke = pickerAnswers({ code: "closed" });
    const { onChange, container } = renderField({ kind: "video" });

    fireEvent.click(pickArea(container));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("pick:shopify/File", {
        data: { mediaTypes: ["Video"], multiSelect: false },
      }),
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(pickArea(container)).toBeTruthy();
  });

  it("explains a picker that fails and lets the merchant try again", async () => {
    pickerAnswers(
      { code: "error", message: "Unavailable" },
      { code: "ok", data: { ids: [PHOTO_ID] } },
    );
    stubFileStatus(READY_PHOTO_STATUS);
    const { container, onChange } = renderField();

    fireEvent.click(pickArea(container));

    await waitFor(() =>
      expect(
        screen.getByText(
          "Shopify Files couldn't be opened. Try again or add the file from a URL.",
        ),
      ).toBeTruthy(),
    );
    expect(pickArea(container).hasAttribute("disabled")).toBe(false);

    fireEvent.click(pickArea(container));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        source: "file",
        fileId: PHOTO_ID,
        url: PHOTO_URL,
        previewUrl: null,
      }),
    );
  });
});

describe("MediaField, processing", () => {
  it("blocks saving while a photo processes", () => {
    const { onBusyChange } = renderField({ value: pendingFile(PHOTO_ID) });

    expect(screen.getByText("Processing photo")).toBeTruthy();
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    expect(polling.ids).toEqual([PHOTO_ID]);
  });

  it("lets the merchant save while a video processes", () => {
    const { onBusyChange } = renderField({
      kind: "video",
      value: pendingFile(VIDEO_ID),
    });

    expect(screen.getByText("Processing video")).toBeTruthy();
    expect(
      screen.getByText(
        "You can save now. The video appears on your verification page when it's ready.",
      ),
    ).toBeTruthy();
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it("fills in the URL when the file is ready and announces it", () => {
    const { onChange, container } = renderField({
      value: pendingFile(PHOTO_ID),
    });

    act(() =>
      polling.onStatuses!([
        {
          id: PHOTO_ID,
          kind: "photo",
          status: "ready",
          url: PHOTO_URL,
          previewUrl: null,
          errorCode: null,
        },
      ]),
    );

    expect(onChange).toHaveBeenCalledWith({
      source: "file",
      fileId: PHOTO_ID,
      url: PHOTO_URL,
      previewUrl: null,
    });
    expect(container.querySelector('[aria-live="polite"]')!.textContent).toBe(
      "Photo uploaded",
    );
  });

  it("unlinks a file that failed and shows why", () => {
    const { onChange, container } = renderField({
      kind: "video",
      value: pendingFile(VIDEO_ID),
    });

    act(() =>
      polling.onStatuses!([
        {
          id: VIDEO_ID,
          kind: "video",
          status: "failed",
          url: null,
          previewUrl: null,
          errorCode: "VIDEO_MAX_DURATION_ERROR",
        },
      ]),
    );

    expect(onChange).toHaveBeenCalledWith(null);
    expect(pickArea(container)).toBeTruthy();
    expect(
      screen.getByText("This video is longer than 10 minutes."),
    ).toBeTruthy();
  });
});

describe("MediaField, ready", () => {
  const readyPhoto: MediaValue = { source: "url", url: PHOTO_URL };

  it("names Replace and Remove after the field", () => {
    renderField({ value: readyPhoto });

    expect(labelOf("Replace")).toBe("Replace photo");
    expect(labelOf("Remove")).toBe("Remove photo");
  });

  it("shows a 800-pixel thumbnail with the file name, Replace, and Remove", () => {
    const { container } = renderField({ value: readyPhoto });
    const image = container.querySelector("s-image")!;
    const link = container.querySelector("s-clickable")!;

    expect(new URL(image.getAttribute("src")!).searchParams.get("width")).toBe(
      "800",
    );
    expect(image.getAttribute("alt")).toBe("Proof photo");
    expect(link.getAttribute("href")).toBe(PHOTO_URL);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.getByText("IS141909PMM-photo front.jpg")).toBeTruthy();
    expect(screen.getByText("Replace").id).toBe("media-photo");
    expect(screen.getByText("Remove")).toBeTruthy();
    expect(screen.queryByText("Add photo")).toBeNull();
  });

  it("unlinks the photo on Remove", () => {
    const { onChange } = renderField({ value: readyPhoto });

    fireEvent.click(screen.getByText("Remove"));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("opens Shopify Files on Replace and keeps the photo when it is closed", async () => {
    const invoke = pickerAnswers({ code: "closed" });
    const { container, onChange } = renderField({ value: readyPhoto });

    fireEvent.click(screen.getByText("Replace"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("pick:shopify/File", {
        data: { mediaTypes: ["MediaImage"], multiSelect: false },
      }),
    );
    expect(container.querySelector("s-image")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("puts the replaced photo back when the new file fails to process", async () => {
    pickerAnswers({ code: "ok", data: { ids: [PHOTO_ID] } });
    stubFileStatus({ ...READY_PHOTO_STATUS, status: "processing", url: null });
    const { container, onChange, rerender, props } = renderField({
      value: readyPhoto,
    });

    fireEvent.click(screen.getByText("Replace"));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(pendingFile(PHOTO_ID)),
    );
    rerender(<MediaField {...props} value={pendingFile(PHOTO_ID)} />);
    act(() =>
      polling.onStatuses!([
        {
          ...READY_PHOTO_STATUS,
          status: "failed",
          url: null,
          errorCode: "INVALID_IMAGE_FILE_SIZE",
        },
      ]),
    );

    expect(onChange).toHaveBeenLastCalledWith(readyPhoto);

    rerender(<MediaField {...props} value={readyPhoto} />);

    expect(screen.getByText("This photo is larger than 20 MB.")).toBeTruthy();
    expect(labelOf("Cancel")).toBe("Cancel replacing the photo");

    fireEvent.click(screen.getByText("Cancel"));

    expect(container.querySelector("s-image")).toBeTruthy();
  });

  it("plays a ready video with its preview image", () => {
    const { container } = renderField({
      kind: "video",
      value: {
        source: "file",
        fileId: VIDEO_ID,
        url: "https://cdn.shopify.com/videos/c/o/v/signing.mp4",
        previewUrl: "https://cdn.shopify.com/s/files/preview.jpg",
      },
    });
    const video = container.querySelector("video")!;

    expect(video.getAttribute("src")).toBe(
      "https://cdn.shopify.com/videos/c/o/v/signing.mp4",
    );
    expect(video.getAttribute("poster")).toBe(
      "https://cdn.shopify.com/s/files/preview.jpg",
    );
    expect(video.getAttribute("aria-label")).toBe("Proof video");
    expect(video.hasAttribute("controls")).toBe(true);
    expect(screen.getByText("signing.mp4")).toBeTruthy();
  });

  it("offers Replace and Remove when the photo can't be loaded", () => {
    const { container } = renderField({ value: readyPhoto });

    act(() => {
      container.querySelector("s-image")!.dispatchEvent(new Event("error"));
    });

    expect(
      screen.getByText(
        "This photo couldn't be loaded. Replace it or remove it.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Replace")).toBeTruthy();
    expect(screen.getByText("Remove")).toBeTruthy();
  });
});

describe("MediaField, add from URL", () => {
  function openUrlField(container: HTMLElement) {
    fireEvent.click(screen.getByText("Add from URL"));

    return container.querySelector("s-url-field")!;
  }

  it("focuses the URL field and rejects a link that isn't https", () => {
    const { container, onChange } = renderField();
    const field = openUrlField(container);

    expect(field.getAttribute("label")).toBe("Photo URL");
    expect(field.getAttribute("placeholder")).toBe("https://");
    expect(document.activeElement).toBe(field);
    expect(labelOf("Add")).toBe("Add photo URL");
    expect(labelOf("Cancel")).toBe("Cancel adding a photo URL");

    Object.assign(field, { value: "http://example.com/proof.jpg" });
    fireEvent.click(screen.getByText("Add"));

    expect(field.getAttribute("error")).toBe(
      "Enter a link that starts with https://",
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("adds a link that opens an image when Enter is pressed", async () => {
    const { container, onChange } = renderField();
    const field = openUrlField(container);

    Object.assign(field, { value: " https://example.com/proof.jpg " });
    fireEvent.keyDown(field, { key: "Enter" });

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        source: "url",
        url: "https://example.com/proof.jpg",
      }),
    );
    expect(probes.canLoadImage).toHaveBeenCalledWith(
      "https://example.com/proof.jpg",
    );
  });

  it("explains a link that doesn't open a video", async () => {
    probes.canLoadVideo.mockResolvedValueOnce(false);
    const { container, onChange } = renderField({ kind: "video" });
    const field = openUrlField(container);

    expect(field.getAttribute("label")).toBe("Video URL");

    Object.assign(field, { value: "https://example.com/page.html" });
    fireEvent.click(screen.getByText("Add"));

    await waitFor(() =>
      expect(field.getAttribute("error")).toBe(
        "This link doesn't open a video. Check it and try again.",
      ),
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(labelOf("Add")).toBe("Add video URL");
    expect(labelOf("Cancel")).toBe("Cancel adding a video URL");
  });

  it("closes an open URL field when the form is discarded", () => {
    const { container, rerender, props } = renderField();

    openUrlField(container);
    rerender(<MediaField {...props} discardToken={1} />);

    expect(container.querySelector("s-url-field")).toBeNull();
    expect(pickArea(container)).toBeTruthy();
  });

  it("ignores a link check that finishes after Cancel", async () => {
    const check = deferred<boolean>();
    probes.canLoadImage.mockReturnValueOnce(check.promise);
    const { container, onChange } = renderField();
    const field = openUrlField(container);

    Object.assign(field, { value: "https://example.com/proof.jpg" });
    fireEvent.click(screen.getByText("Add"));
    fireEvent.click(screen.getByText("Cancel"));
    await act(async () => {
      check.resolve(true);
    });

    expect(probes.canLoadImage).toHaveBeenCalledWith(
      "https://example.com/proof.jpg",
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(container.querySelector("s-url-field")).toBeNull();
  });
});
