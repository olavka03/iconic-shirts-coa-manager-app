import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFakeAdmin,
  type FakeAdmin,
} from "../../../tests/fakes/admin-api.fake";
import { setSleepForTests } from "./admin-graphql.gateway";
import { getFileStatuses } from "./files.gateway";

const CDN = "https://cdn.shopify.com/videos/c/vp/0001";
const mp4 = (height: number) => ({
  url: `${CDN}/${height}.mp4`,
  format: "mp4",
  height,
  mimeType: "video/mp4",
});

let fake: FakeAdmin;

beforeEach(() => {
  fake = createFakeAdmin();
  setSleepForTests(async () => {});
});

afterEach(() => setSleepForTests(null));

async function statusOf(id: string) {
  const [status] = await getFileStatuses(fake.client, [id]);

  return status;
}

describe("getFileStatuses (spec §4.5)", () => {
  it("uses image.url for a ready JPEG", async () => {
    const file = fake.addFile({ kind: "photo", mimeType: "image/jpeg" });

    expect(await statusOf(file.id)).toEqual({
      id: file.id,
      kind: "photo",
      status: "ready",
      url: file.url,
      previewUrl: null,
      errorCode: null,
    });
  });

  it("uses the JPG transform for a ready HEIC", async () => {
    const file = fake.addFile({ kind: "photo", mimeType: "image/heic" });

    expect((await statusOf(file.id)).url).toBe(`${file.url}&format=jpg`);
  });

  it.each(["UPLOADED", "PROCESSING"] as const)(
    "reports %s as processing",
    async (status) => {
      const file = fake.addFile({ kind: "photo", status });

      expect(await statusOf(file.id)).toMatchObject({
        status: "processing",
        url: null,
      });
    },
  );

  it("reports a ready photo without an image as processing", async () => {
    const file = fake.addFile({ kind: "photo", url: null });

    expect((await statusOf(file.id)).status).toBe("processing");
  });

  it("reports a failed file with its error code", async () => {
    const file = fake.addFile({
      kind: "video",
      status: "FAILED",
      errorCode: "VIDEO_MAX_DURATION_ERROR",
    });

    expect(await statusOf(file.id)).toEqual({
      id: file.id,
      kind: "video",
      status: "failed",
      url: null,
      previewUrl: null,
      errorCode: "VIDEO_MAX_DURATION_ERROR",
    });
  });

  it("reports a removed file as missing, with the kind taken from the id", async () => {
    const video = fake.addFile({ kind: "video" });
    const photo = fake.addFile({ kind: "photo" });

    fake.removeFile(video.id);
    fake.removeFile(photo.id);

    expect(await getFileStatuses(fake.client, [video.id, photo.id])).toEqual([
      {
        id: video.id,
        kind: "video",
        status: "missing",
        url: null,
        previewUrl: null,
        errorCode: null,
      },
      {
        id: photo.id,
        kind: "photo",
        status: "missing",
        url: null,
        previewUrl: null,
        errorCode: null,
      },
    ]);
  });

  it("picks the tallest MP4 up to 1080p for a MOV original", async () => {
    const file = fake.addFile({
      kind: "video",
      mimeType: "video/quicktime",
      url: `${CDN}/original.mov`,
      sources: [
        mp4(480),
        mp4(2160),
        mp4(720),
        mp4(1080),
        {
          url: `${CDN}/original.mov`,
          format: "mov",
          height: 2160,
          mimeType: "video/quicktime",
        },
      ],
      previewUrl: `${CDN}/poster.jpg`,
    });

    expect(await statusOf(file.id)).toEqual({
      id: file.id,
      kind: "video",
      status: "ready",
      url: `${CDN}/1080.mp4`,
      previewUrl: `${CDN}/poster.jpg`,
      errorCode: null,
    });
  });

  it("falls back to the smallest MP4 when every MP4 is taller than 1080p", async () => {
    const file = fake.addFile({
      kind: "video",
      sources: [mp4(2160), mp4(1440)],
    });

    expect((await statusOf(file.id)).url).toBe(`${CDN}/1440.mp4`);
  });

  it("uses the original only when there is no MP4", async () => {
    const file = fake.addFile({
      kind: "video",
      url: `${CDN}/original.mov`,
      sources: [
        {
          url: `${CDN}/hls.m3u8`,
          format: "m3u8",
          height: 720,
          mimeType: "application/x-mpegURL",
        },
      ],
    });

    expect((await statusOf(file.id)).url).toBe(`${CDN}/original.mov`);
  });

  it("keeps the order of the ids in one call", async () => {
    const photo = fake.addFile({ kind: "photo" });
    const video = fake.addFile({ kind: "video", status: "PROCESSING" });

    const statuses = await getFileStatuses(fake.client, [
      video.id,
      "gid://shopify/MediaImage/404",
      photo.id,
    ]);

    expect(statuses.map((status) => [status.id, status.status])).toEqual([
      [video.id, "processing"],
      ["gid://shopify/MediaImage/404", "missing"],
      [photo.id, "ready"],
    ]);
    expect(fake.callsTo("CoaFileStatus")).toHaveLength(1);
  });

  it("makes no call for no ids", async () => {
    expect(await getFileStatuses(fake.client, [])).toEqual([]);
    expect(fake.calls).toEqual([]);
  });
});
