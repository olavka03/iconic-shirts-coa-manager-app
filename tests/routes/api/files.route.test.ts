import { beforeEach, describe, expect, it, vi } from "vitest";
import { loader } from "~/routes/api/files.route";
import { createFakeAdmin, type FakeAdmin } from "../../fakes/admin-api.fake";
import {
  getRequest,
  mockAdmin,
  readJson,
  routeArguments,
} from "../route-test.utils";

vi.mock("~/.server/shopify/shopify-app.config", () => ({
  authenticate: { admin: vi.fn() },
}));

let fake: FakeAdmin;

const CDN = "https://cdn.shopify.com/s/files/1/0000/0001/files";
const VIDEO_CDN = "https://cdn.shopify.com/videos/c/vp/0001";

const statuses = async (ids: string[]) =>
  readJson(
    await loader(
      routeArguments(
        getRequest(`/api/files?${new URLSearchParams({ ids: ids.join(",") })}`),
      ),
    ),
  );
const mp4 = (height: number) => ({
  url: `${VIDEO_CDN}/${height}.mp4`,
  format: "mp4",
  height,
  mimeType: "video/mp4",
});

beforeEach(() => {
  fake = createFakeAdmin();
  mockAdmin(fake);
});

describe("GET /api/files?ids= (spec §5, §8.1)", () => {
  it("reports a ready photo with its URL", async () => {
    const photo = fake.addFile({ kind: "photo" });

    expect(await statuses([photo.id])).toEqual({
      status: 200,
      body: {
        files: [
          {
            id: photo.id,
            kind: "photo",
            status: "ready",
            url: photo.url,
            previewUrl: null,
            errorCode: null,
          },
        ],
      },
    });
  });

  it("gives a HEIC photo its JPG URL and a MOV video its tallest MP4 up to 1080p", async () => {
    const heic = fake.addFile({
      kind: "photo",
      mimeType: "image/heic",
      url: `${CDN}/signing.heic?v=1`,
    });
    const mov = fake.addFile({
      kind: "video",
      mimeType: "video/quicktime",
      url: `${VIDEO_CDN}/original.mov`,
      sources: [mp4(2160), mp4(720), mp4(1080)],
    });

    expect((await statuses([heic.id, mov.id])).body).toEqual({
      files: [
        expect.objectContaining({
          id: heic.id,
          status: "ready",
          url: `${CDN}/signing.heic?v=1&format=jpg`,
        }),
        expect.objectContaining({
          id: mov.id,
          kind: "video",
          status: "ready",
          url: `${VIDEO_CDN}/1080.mp4`,
          previewUrl: mov.previewUrl,
        }),
      ],
    });
  });

  it("answers 422 for more than 10 ids or a malformed id, without a Shopify call", async () => {
    const eleven = Array.from(
      { length: 11 },
      (_unused, index) => `gid://shopify/MediaImage/${index + 1}`,
    );

    for (const ids of [
      eleven,
      ["gid://shopify/Product/1"],
      ["gid://shopify/MediaImage/1", "gid://shopify/Video/x"],
      [""],
    ]) {
      expect(await statuses(ids)).toEqual({
        status: 422,
        body: { ok: false },
      });
    }

    expect(
      await readJson(await loader(routeArguments(getRequest("/api/files")))),
    ).toEqual({ status: 422, body: { ok: false } });
    expect(fake.calls).toEqual([]);
  });
});
