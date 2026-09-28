import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setSleepForTests } from "~/.server/gateways/admin-graphql.gateway";
import type { StoredMediaColumns } from "~/features/media/types/media.types";
import {
  createFakeAdmin,
  type FakeAdmin,
} from "../../../../tests/fakes/admin-api.fake";
import { getMediaStatuses, resolveMediaForSave } from "./media.service";

const VIDEO_CDN = "https://cdn.shopify.com/videos/c/vp/0001";
const NO_COLUMNS: StoredMediaColumns = {
  photoUrl: null,
  photoFileId: null,
  videoUrl: null,
  videoFileId: null,
  videoPreviewUrl: null,
};

let fake: FakeAdmin;

beforeEach(() => {
  fake = createFakeAdmin();
  setSleepForTests(async () => {});
});

afterEach(() => setSleepForTests(null));

describe("getMediaStatuses", () => {
  it("returns the normalised statuses and rejects with the Response of an expired session", async () => {
    const photo = fake.addFile({ kind: "photo" });

    expect(await getMediaStatuses(fake.client, [photo.id])).toEqual([
      {
        id: photo.id,
        kind: "photo",
        status: "ready",
        url: photo.url,
        previewUrl: null,
        errorCode: null,
      },
    ]);

    fake.failNext("CoaFileStatus", { throwResponse: 401 });

    await expect(
      getMediaStatuses(fake.client, [photo.id]),
    ).rejects.toBeInstanceOf(Response);
  });
});

describe("resolveMediaForSave (spec §4.6 step 1)", () => {
  it("stores nothing for no media and a pasted link as it is", async () => {
    const result = await resolveMediaForSave(
      fake.client,
      null,
      { source: "url", url: "https://example.com/proof.mp4" },
      null,
    );

    expect(result).toEqual({
      columns: { ...NO_COLUMNS, videoUrl: "https://example.com/proof.mp4" },
      fieldErrors: {},
    });
    expect(fake.calls).toEqual([]);
  });

  it("reuses the saved file without asking Shopify", async () => {
    const previous: StoredMediaColumns = {
      photoUrl: "https://cdn.shopify.com/s/files/photo.jpg",
      photoFileId: "gid://shopify/MediaImage/11",
      videoUrl: "https://cdn.shopify.com/s/files/video.mp4",
      videoFileId: "gid://shopify/Video/12",
      videoPreviewUrl: "https://cdn.shopify.com/s/files/video-preview.jpg",
    };

    const result = await resolveMediaForSave(
      fake.client,
      { source: "file", fileId: "gid://shopify/MediaImage/11" },
      { source: "file", fileId: "gid://shopify/Video/12" },
      previous,
    );

    expect(result).toEqual({ columns: previous, fieldErrors: {} });
    expect(fake.calls).toEqual([]);
  });

  it("reads a saved file again while it has no URL", async () => {
    const video = fake.addFile({ kind: "video", status: "PROCESSING" });

    const result = await resolveMediaForSave(
      fake.client,
      null,
      { source: "file", fileId: video.id },
      { ...NO_COLUMNS, videoFileId: video.id },
    );

    expect(fake.callsTo("CoaFileStatus")).toHaveLength(1);
    expect(result.columns).toEqual({ ...NO_COLUMNS, videoFileId: video.id });
  });

  it("reads both new files in one call: ready gives the URL and poster, processing stays pending", async () => {
    const photo = fake.addFile({ kind: "photo", status: "PROCESSING" });
    const video = fake.addFile({
      kind: "video",
      sources: [
        {
          url: `${VIDEO_CDN}/720.mp4`,
          format: "mp4",
          height: 720,
          mimeType: "video/mp4",
        },
      ],
    });

    const result = await resolveMediaForSave(
      fake.client,
      { source: "file", fileId: photo.id },
      { source: "file", fileId: video.id },
      null,
    );

    expect(fake.callsTo("CoaFileStatus")).toEqual([
      { operation: "CoaFileStatus", variables: { ids: [photo.id, video.id] } },
    ]);
    expect(result).toEqual({
      columns: {
        photoUrl: null,
        photoFileId: photo.id,
        videoUrl: `${VIDEO_CDN}/720.mp4`,
        videoFileId: video.id,
        videoPreviewUrl: video.previewUrl,
      },
      fieldErrors: {},
    });
  });

  it("reports a failed file and a missing file on their fields", async () => {
    const photo = fake.addFile({
      kind: "photo",
      status: "FAILED",
      errorCode: "INVALID_IMAGE_RESOLUTION",
    });

    const result = await resolveMediaForSave(
      fake.client,
      { source: "file", fileId: photo.id },
      { source: "file", fileId: "gid://shopify/Video/404" },
      null,
    );

    expect(result.fieldErrors).toEqual({
      photo:
        "This photo is larger than 20 megapixels. Export a smaller copy and try again.",
      video: "This file couldn't be added. Try another file.",
    });
  });

  it("stores a new file as pending when Shopify can't be read", async () => {
    const photo = fake.addFile({ kind: "photo" });

    fake.failNext("CoaFileStatus", { throwResponse: 500 });

    const result = await resolveMediaForSave(
      fake.client,
      { source: "file", fileId: photo.id },
      null,
      null,
    );

    expect(result).toEqual({
      columns: { ...NO_COLUMNS, photoFileId: photo.id },
      fieldErrors: {},
    });
  });

  it("rejects with the Response of an expired session", async () => {
    const photo = fake.addFile({ kind: "photo" });

    fake.failNext("CoaFileStatus", { throwResponse: 401 });

    const resolving = resolveMediaForSave(
      fake.client,
      { source: "file", fileId: photo.id },
      null,
      null,
    );

    await expect(resolving).rejects.toBeInstanceOf(Response);
    await expect(resolving).rejects.toMatchObject({ status: 401 });
  });
});
