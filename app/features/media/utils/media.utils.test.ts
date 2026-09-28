import { describe, expect, it } from "vitest";
import {
  MEDIA_MESSAGES,
  hasStoredMedia,
  isStorableHttpsUrl,
  mediaErrorMessage,
  mediaKindOfFileId,
  pendingFileIdOf,
  pendingFileIds,
  thumbnailUrl,
} from "./media.utils";

const PHOTO_ID = "gid://shopify/MediaImage/101";
const VIDEO_ID = "gid://shopify/Video/202";
const NOTHING_STORED = {
  photoUrl: null,
  photoFileId: null,
  videoUrl: null,
  videoFileId: null,
};

describe("mediaErrorMessage (spec §6.5)", () => {
  it.each([
    ["VIDEO_MAX_DURATION_ERROR", "This video is longer than 10 minutes."],
    [
      "INVALID_IMAGE_RESOLUTION",
      "This photo is larger than 20 megapixels. Export a smaller copy and try again.",
    ],
    ["INVALID_IMAGE_FILE_SIZE", "This photo is larger than 20 MB."],
    ["UNSUPPORTED_IMAGE_FILE_TYPE", "Upload a JPG, PNG, WEBP, or HEIC image."],
    ["VIDEO_INVALID_FILETYPE_ERROR", "Upload an MP4, MOV, or WEBM video."],
    [
      "VIDEO_MAX_WIDTH_ERROR",
      "This video's resolution is above 4K. Export a smaller copy and try again.",
    ],
    [
      "VIDEO_MAX_HEIGHT_ERROR",
      "This video's resolution is above 4K. Export a smaller copy and try again.",
    ],
    ["FILE_STORAGE_LIMIT_EXCEEDED", "Your store's file storage is full."],
    ["NOT_FOUND", "This file couldn't be added. Try another file."],
    [
      "ACCESS_DENIED",
      "You don't have permission to upload files. Ask the store owner for access to Files.",
    ],
    [
      "MEDIA_TIMEOUT_ERROR",
      "Shopify couldn't process this file. Try a different file.",
    ],
    ["", "Shopify couldn't process this file. Try a different file."],
  ])("%s", (code, message) => expect(mediaErrorMessage(code)).toBe(message));

  it("keeps the other §6.5 messages", () => {
    expect(MEDIA_MESSAGES).toMatchObject({
      pickerFailed:
        "Shopify Files couldn't be opened. Try again or add the file from a URL.",
      pickerUnavailable:
        "Shopify Files isn't available here. Add a URL instead.",
      urlHttps: "Enter a link that starts with https://",
      urlPhoto: "This link doesn't open an image. Check it and try again.",
      urlVideo: "This link doesn't open a video. Check it and try again.",
      brokenPhoto: "This photo couldn't be loaded. Replace it or remove it.",
    });
  });
});

describe("links", () => {
  it("stores https links up to 2,048 characters", () => {
    const base = "https://cdn.shopify.com/";
    expect(isStorableHttpsUrl(`${base}${"a".repeat(2048 - base.length)}`)).toBe(
      true,
    );
    expect(isStorableHttpsUrl(`${base}${"a".repeat(2049 - base.length)}`)).toBe(
      false,
    );
    expect(isStorableHttpsUrl("http://cdn.shopify.com/a.png")).toBe(false);
    expect(isStorableHttpsUrl("https://")).toBe(false);
    expect(isStorableHttpsUrl("not a url")).toBe(false);
  });
  it("sizes Shopify CDN thumbnails only", () => {
    expect(
      thumbnailUrl(
        "https://cdn.shopify.com/s/files/1/0913/0226/5159/files/a.png?v=1",
        80,
      ),
    ).toBe(
      "https://cdn.shopify.com/s/files/1/0913/0226/5159/files/a.png?v=1&width=80",
    );
    expect(
      thumbnailUrl("https://iconicshirts.com/cdn/shop/files/a.png", 80),
    ).toBe("https://iconicshirts.com/cdn/shop/files/a.png?width=80");
    expect(
      thumbnailUrl("https://cdn.shopify.com/s/files/a.png?width=800", 80),
    ).toBe("https://cdn.shopify.com/s/files/a.png?width=80");
    expect(thumbnailUrl("https://example.com/a.png", 80)).toBe(
      "https://example.com/a.png",
    );
    expect(thumbnailUrl("https://cdn.shopify.com/other/a.png", 80)).toBe(
      "https://cdn.shopify.com/other/a.png",
    );
    expect(thumbnailUrl("not a url", 80)).toBe("not a url");
  });
});

describe("stored media", () => {
  it("reads the kind from a Shopify file id", () => {
    expect(mediaKindOfFileId(PHOTO_ID)).toBe("photo");
    expect(mediaKindOfFileId(VIDEO_ID)).toBe("video");
    expect(mediaKindOfFileId("gid://shopify/GenericFile/1")).toBeNull();
    expect(mediaKindOfFileId("gid://shopify/Video/")).toBeNull();
  });
  it("counts a file id without a url as pending", () => {
    const columns = {
      ...NOTHING_STORED,
      photoFileId: PHOTO_ID,
      videoFileId: VIDEO_ID,
      videoUrl: "https://cdn.shopify.com/videos/c/vp/202.mp4",
    };

    expect(pendingFileIdOf(columns, "photo")).toBe(PHOTO_ID);
    expect(pendingFileIdOf(columns, "video")).toBeNull();
    expect(pendingFileIds(columns)).toEqual([PHOTO_ID]);
    expect(pendingFileIds(NOTHING_STORED)).toEqual([]);
  });
  it("counts a url or a file id still processing as stored", () => {
    expect(
      hasStoredMedia({ ...NOTHING_STORED, photoFileId: PHOTO_ID }, "photo"),
    ).toBe(true);
    expect(
      hasStoredMedia(
        { ...NOTHING_STORED, videoUrl: "https://example.com/a.mp4" },
        "video",
      ),
    ).toBe(true);
    expect(hasStoredMedia(NOTHING_STORED, "photo")).toBe(false);
  });
});
