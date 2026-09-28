import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/.server/db/prisma.singleton";
import { setSleepForTests } from "~/.server/gateways/admin-graphql.gateway";
import { setLogSink, type LogLine } from "~/.server/logging/logger.service";
import { historyStamp } from "~/.server/repositories/certificate-codes.repository";
import { getCertificate } from "~/.server/repositories/certificate.repository";
import type { CertificateRecord } from "~/.server/repositories/certificate.types";
import {
  enqueueUpsert,
  getQueueRow,
} from "~/.server/repositories/sync-queue.repository";
import {
  createFakeAdmin,
  type FakeAdmin,
} from "../../../../tests/fakes/admin-api.fake";
import {
  giftCardLine,
  LINE_ITEM_IDS,
  ORDER_IDS,
} from "../../../../tests/fakes/orders.fake";
import {
  createCertificateRow,
  makeWrite,
  OTHER_SHOP,
  SHOP,
} from "../../../../tests/helpers/certificate-row.factory";
import { deleteCertificates } from "./certificate-delete.service";
import { importCertificate } from "./certificate-import.service";
import {
  getCertificateDetail,
  getDuplicateDraft,
} from "./certificate-read.service";
import {
  createCertificate,
  updateCertificate,
  type SaveResult,
} from "./certificate-save.service";
import {
  completeCertificateMedia,
  completePendingFiles,
  completePendingInBackground,
  resetCompletionThrottle,
} from "./media-completion.service";
import {
  dropCodeDictionary,
  getCodeDictionary,
} from "~/.server/services/codes/codes.service";
import { flushBackgroundMirrors } from "~/.server/services/mirror/mirror-background.service";
import { resetMirrorMemos } from "~/.server/services/mirror/mirror-sync.service";
import { toMetaobjectValues } from "~/.server/services/mirror/mirror-values.utils";
import { clearShopInfoCache } from "~/.server/services/shop/shop-info.service";
import { testId } from "../../../../tests/helpers/test-ids.utils";

vi.mock(
  "~/.server/repositories/sync-queue.repository",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/.server/repositories/sync-queue.repository")
      >();

    return { ...actual, enqueueUpsert: vi.fn(actual.enqueueUpsert) };
  },
);

let fake: FakeAdmin;
let logs: LogLine[];
const context = () => ({ shop: SHOP, admin: fake.client });

beforeEach(() => {
  fake = createFakeAdmin();
  logs = [];
  resetMirrorMemos();
  clearShopInfoCache();
  dropCodeDictionary(SHOP);
  resetCompletionThrottle();
  setSleepForTests(async () => {});
  setLogSink((line) => logs.push(line));
});

afterEach(async () => {
  await flushBackgroundMirrors();
  setSleepForTests(null);
  setLogSink(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const GULER = "Arda Güler Signed Real Madrid 2026/27 Home Football Shirt";
const BAYERN_TITLE =
  "Robert Lewandowski Signed Bayern Munich Football Shirt - 2015-16 Home";
const VIDEO_CDN = "https://cdn.shopify.com/videos/c/vp/0001";
const CAPACITY =
  "All certificates for this item are already created. Select another item.";
const ITEM_GONE = "This item is no longer in the order. Select another item.";
const CODE_TAKEN =
  "This code is already used for Robert Lewandowski, Bayern Munich Football Shirt - 2015-16 Home.";

const input = (overrides: Record<string, unknown> = {}) => ({
  code: "IS141002RLBM1516",
  order: { id: ORDER_IDS.order141002, name: "#999" },
  lineItem: { id: LINE_ITEM_IDS.bayern, title: "posted title" },
  item: "Bayern Munich Football Shirt - 2015-16 Home",
  productId: null,
  productHint: null,
  photo: null,
  video: null,
  notes: "",
  signers: [{ name: "Robert Lewandowski", date: null, location: "" }],
  ...overrides,
});
const guler = (code: string, overrides: Record<string, unknown> = {}) =>
  input({
    code,
    order: { id: ORDER_IDS.order141004, name: "#141004" },
    lineItem: { id: LINE_ITEM_IDS.guler, title: GULER },
    item: "Real Madrid 2026/27 Home Football Shirt",
    signers: [{ name: "Arda Güler", date: null, location: "" }],
    ...overrides,
  });
const dortmund = (code: string, overrides: Record<string, unknown> = {}) =>
  input({
    code,
    lineItem: { id: LINE_ITEM_IDS.dortmund, title: "posted title" },
    item: "Borussia Dortmund Football Shirt - 2011-12 Home",
    ...overrides,
  });
const mp4 = (height: number) => ({
  url: `${VIDEO_CDN}/${height}.mp4`,
  format: "mp4",
  height,
  mimeType: "video/mp4",
});

function mediaInput(fileId: string | null, url: string | null) {
  if (fileId !== null) {
    return { source: "file", fileId };
  }

  return url === null ? null : { source: "url", url };
}

// The form's values for a saved certificate: the stored link is kept by sending no order.
function editOf(
  certificate: CertificateRecord,
  overrides: Record<string, unknown> = {},
) {
  return {
    code: certificate.code,
    order: null,
    lineItem: null,
    item: certificate.item,
    productId: certificate.productId,
    productHint: null,
    photo: mediaInput(certificate.photoFileId, certificate.photoUrl),
    video: mediaInput(certificate.videoFileId, certificate.videoUrl),
    notes: certificate.notes,
    signers: certificate.signers.map((signer) => ({
      name: signer.name,
      date: signer.date,
      location: signer.location ?? "",
    })),
    ...overrides,
  };
}

async function stored(id: string, shop = SHOP): Promise<CertificateRecord> {
  const certificate = await getCertificate(shop, id);

  if (!certificate) {
    throw new Error(`Certificate ${id} is gone.`);
  }

  return certificate;
}

async function created(raw: unknown): Promise<string> {
  const result = await createCertificate(context(), raw);

  if (!result.ok) {
    throw new Error(`The save failed: ${JSON.stringify(result)}`);
  }

  await flushBackgroundMirrors();

  return result.id;
}

async function edited(id: string, overrides: Record<string, unknown> = {}) {
  const result = await updateCertificate(
    context(),
    id,
    editOf(await stored(id), overrides),
  );

  await flushBackgroundMirrors();

  return result;
}

const invalid = (fieldErrors: Record<string, string>): SaveResult => ({
  ok: false,
  kind: "validation",
  fieldErrors,
});
const entryFields = (handle: string) => fake.entries.get(handle)?.fields;
const events = (name: string) => logs.filter((line) => line.event === name);
const orderOf = (id: string) => {
  const order = fake.orders.find((candidate) => candidate.id === id);

  if (!order) {
    throw new Error(`The fake has no order ${id}.`);
  }

  return order;
};

describe("create and update (spec §4.6, §12.4)", () => {
  it("#1 create stores the row, its signers and derived columns, and one matching entry", async () => {
    const id = await created(
      input({
        signers: [
          {
            name: "Robert Lewandowski",
            date: { precision: "DAY", iso: "2016-05-14" },
            location: "Munich",
          },
        ],
      }),
    );
    const certificate = await stored(id);
    const derived = await prisma.certificate.findUniqueOrThrow({
      where: { id },
      select: { searchText: true, latestSignedOn: true },
    });

    expect(certificate.signers).toEqual([
      {
        name: "Robert Lewandowski",
        date: { precision: "DAY", iso: "2016-05-14" },
        location: "Munich",
      },
    ]);
    expect(derived.searchText).toContain("141002");
    expect(derived.searchText).toContain("robert lewandowski");
    expect(derived.latestSignedOn).toEqual(new Date("2016-05-14T00:00:00Z"));
    expect([...fake.entries.keys()]).toEqual(["is141002rlbm1516"]);
    expect(entryFields("is141002rlbm1516")).toEqual(
      toMetaobjectValues(certificate),
    );
    expect(await prisma.syncFailure.count()).toBe(0);
  });

  it("#2 a failing mirror never fails the save and keeps one queue row", async () => {
    fake.failNext("CoaCertificateUpsert", { throw: "network" }, 2);

    const id = await created(input());

    expect(await getQueueRow(SHOP, id)).toMatchObject({
      action: "UPSERT",
      attempts: 1,
      version: 1,
    });
    expect(
      (await edited(id, { notes: "Signed at the training ground." })).ok,
    ).toBe(true);
    expect(await getQueueRow(SHOP, id)).toMatchObject({
      action: "UPSERT",
      attempts: 2,
      version: 2,
    });
    expect(await prisma.syncFailure.count()).toBe(1);
  });

  it("a code change moves the entry to the new handle", async () => {
    const id = await created(input());

    expect((await edited(id, { code: "IS141002RLFCB1516" })).ok).toBe(true);
    expect([...fake.entries.keys()]).toEqual(["is141002rlfcb1516"]);
    expect(await getQueueRow(SHOP, id)).toBeNull();
  });

  it("#10 a taken code is a code error on create and update; another shop's id is not found", async () => {
    await created(input());

    expect(
      await createCertificate(context(), dortmund("IS141002RLBM1516")),
    ).toEqual(invalid({ code: CODE_TAKEN }));

    const second = await created(dortmund("IS141002RLBD1112"));

    expect(await edited(second, { code: "is141002rlbm1516" })).toEqual(
      invalid({ code: CODE_TAKEN }),
    );

    const foreign = await createCertificateRow({}, { shop: OTHER_SHOP });

    expect(
      await updateCertificate(
        context(),
        foreign.id,
        editOf(await stored(foreign.id, OTHER_SHOP)),
      ),
    ).toEqual({ ok: false, kind: "not_found" });
  });

  it("#17 a save goes on when products and files can't be read", async () => {
    const product = fake.addProduct({
      title: "Bayern Munich 2015-16 Home Shirt",
    });
    const id = await created(input({ productId: product.id }));

    expect(await stored(id)).toMatchObject({
      productId: product.id,
      productTitle: "Bayern Munich 2015-16 Home Shirt",
      productImageUrl: product.imageUrl,
    });

    fake.addProduct({ ...product, title: "Renamed while Shopify is down" });
    fake.failNext("CoaProducts", { throwResponse: 500 });

    expect((await edited(id)).ok).toBe(true);
    expect((await stored(id)).productTitle).toBe(
      "Bayern Munich 2015-16 Home Shirt",
    );

    const picked = fake.addProduct();
    const photo = fake.addFile({ kind: "photo" });

    fake.failNext("CoaProducts", { throwResponse: 500 });
    fake.failNext("CoaFileStatus", { throwResponse: 500 });

    const hinted = await edited(id, {
      productId: picked.id,
      productHint: {
        title: "Picked product",
        imageUrl: "https://cdn.shopify.com/s/files/picked.jpg",
      },
      photo: { source: "file", fileId: photo.id },
    });

    expect(hinted.ok).toBe(true);
    expect(await stored(id)).toMatchObject({
      productId: picked.id,
      productTitle: "Picked product",
      productImageUrl: "https://cdn.shopify.com/s/files/picked.jpg",
      photoFileId: photo.id,
      photoUrl: null,
    });
    expect(
      await completePendingFiles(context(), [photo.id], { awaitMirror: true }),
    ).toEqual({ changedIds: [id] });
    expect((await stored(id)).photoUrl).toBe(photo.url);
    expect(entryFields("is141002rlbm1516")?.photo).toBe(photo.url);
  });

  it("#17 a save clears a product that was deleted in Shopify", async () => {
    const product = fake.addProduct();
    const id = await created(input({ productId: product.id }));

    fake.removeProduct(product.id);

    expect((await edited(id)).ok).toBe(true);
    expect(await stored(id)).toMatchObject({
      productId: null,
      productTitle: null,
      productImageUrl: null,
    });
  });

  it("#17 a save stores the product's current title and image", async () => {
    const product = fake.addProduct({ title: "Bayern Munich Home Shirt" });
    const id = await created(input({ productId: product.id }));
    const renamed = fake.addProduct({
      ...product,
      title: "Bayern Munich 2015-16 Home Shirt",
      imageUrl: "https://cdn.shopify.com/s/files/renamed.jpg",
    });

    expect((await edited(id)).ok).toBe(true);
    expect(await stored(id)).toMatchObject({
      productId: product.id,
      productTitle: "Bayern Munich 2015-16 Home Shirt",
      productImageUrl: renamed.imageUrl,
    });
  });

  it("#17 an expired session at the product read rejects with its Response and changes nothing", async () => {
    const product = fake.addProduct();
    const id = await created(input({ productId: product.id }));
    const before = await stored(id);

    fake.failNext("CoaProducts", { throwResponse: 401 });

    const saving = updateCertificate(
      context(),
      id,
      editOf(before, { item: "Changed item" }),
    );

    await expect(saving).rejects.toBeInstanceOf(Response);
    await expect(saving).rejects.toMatchObject({ status: 401 });
    expect(await stored(id)).toMatchObject({
      version: before.version,
      item: before.item,
    });
  });

  it("#18 create with an order link stores Shopify's name and title and mirrors every order field", async () => {
    const result = (await createCertificate(context(), input())) as Extract<
      SaveResult,
      { ok: true }
    >;

    await flushBackgroundMirrors();

    const certificate = await stored(result.id);

    expect(certificate).toMatchObject({
      orderId: ORDER_IDS.order141002,
      orderName: "#141002",
      lineItemId: LINE_ITEM_IDS.bayern,
      lineItemTitle: BAYERN_TITLE,
    });
    expect(entryFields("is141002rlbm1516")).toMatchObject({
      certificate_id: result.id,
      order_id: ORDER_IDS.order141002,
      order_name: "#141002",
      line_item_id: LINE_ITEM_IDS.bayern,
      line_item_title: BAYERN_TITLE,
    });
    expect(await getQueueRow(SHOP, result.id)).toBeNull();
  });

  it("#19 capacity: quantity 2 allows two certificates; two concurrent creates for the last unit → exactly one succeeds", async () => {
    expect(
      (await createCertificate(context(), guler("IS141004AGRM2627"))).ok,
    ).toBe(true);

    const results = await Promise.all([
      createCertificate(context(), guler("IS141004AGRM2627-2")),
      createCertificate(context(), guler("IS141004AGRM2627-3")),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toEqual(
      invalid({ lineItem: CAPACITY }),
    );
    await flushBackgroundMirrors();
  });

  it("#19 an update at capacity keeps its item without a read, and a delete frees a unit", async () => {
    const first = await created(guler("IS141004AGRM2627"));

    await created(guler("IS141004AGRM2627-2"));

    expect(
      await createCertificate(context(), guler("IS141004AGRM2627-3")),
    ).toEqual(invalid({ lineItem: CAPACITY }));

    const readsBefore = fake.callsTo("CoaOrderLineItems").length;
    const update = await edited(first, {
      notes: "Signed at Valdebebas.",
      order: { id: ORDER_IDS.order141004, name: "#141004" },
      lineItem: { id: LINE_ITEM_IDS.guler, title: GULER },
    });

    expect(update.ok).toBe(true);
    expect(fake.callsTo("CoaOrderLineItems")).toHaveLength(readsBefore);

    await deleteCertificates(context(), [first]);

    await expect(
      createCertificate(context(), guler("IS141004AGRM2627-3")),
    ).resolves.toMatchObject({ ok: true });
  });

  it("#20 an item that left the order, has quantity 0, or is a gift card can't be linked", async () => {
    const bayernOrder = orderOf(ORDER_IDS.order141002);
    const arsenalOrder = orderOf(ORDER_IDS.order141003);
    const gift = giftCardLine("1");

    bayernOrder.lineItems = bayernOrder.lineItems.filter(
      (item) => item.id !== LINE_ITEM_IDS.bayern,
    );
    bayernOrder.lineItems.push(gift);
    arsenalOrder.lineItems[0].currentQuantity = 0;

    expect(await createCertificate(context(), input())).toEqual(
      invalid({ lineItem: ITEM_GONE }),
    );
    expect(
      await createCertificate(
        context(),
        input({
          code: "IS141003DBA0405",
          order: { id: ORDER_IDS.order141003, name: "#141003" },
          lineItem: { id: LINE_ITEM_IDS.arsenal0405, title: "posted title" },
        }),
      ),
    ).toEqual(invalid({ lineItem: ITEM_GONE }));
    expect(
      await createCertificate(
        context(),
        input({ lineItem: { id: gift.id, title: gift.title } }),
      ),
    ).toEqual(invalid({ lineItem: ITEM_GONE }));
    expect(await prisma.certificate.count()).toBe(0);
  });

  it("#21 an order that can't be read is saved with the posted name and title, without a capacity check", async () => {
    await created(guler("IS141004AGRM2627"));
    await created(guler("IS141004AGRM2627-2"));
    fake.failNext("CoaOrderLineItems", { throwResponse: 500 });

    const unread = await created(
      guler("IS141004AGRM2627-3", {
        order: { id: ORDER_IDS.order141004, name: "#999" },
        lineItem: { id: LINE_ITEM_IDS.guler, title: "posted title" },
      }),
    );

    expect(await stored(unread)).toMatchObject({
      orderId: ORDER_IDS.order141004,
      orderName: "#999",
      lineItemId: LINE_ITEM_IDS.guler,
      lineItemTitle: "posted title",
    });

    orderOf(ORDER_IDS.order141002).outsideWindow = true;

    expect(await stored(await created(input()))).toMatchObject({
      orderId: ORDER_IDS.order141002,
      orderName: "#999",
      lineItemTitle: "posted title",
    });
  });

  it("#21 an expired session at the order read rejects with its Response and writes nothing", async () => {
    fake.failNext("CoaOrderLineItems", { throwResponse: 401 });

    const saving = createCertificate(context(), input());

    await expect(saving).rejects.toBeInstanceOf(Response);
    await expect(saving).rejects.toMatchObject({ status: 401 });
    await flushBackgroundMirrors();

    expect(await prisma.certificate.count()).toBe(0);
    expect(await prisma.syncFailure.count()).toBe(0);
  });

  it("#22 an imported certificate keeps its order name, can be linked later, and needs an item with an order", async () => {
    const imported = await createCertificateRow({ orderName: "#141909" });

    expect((await edited(imported.id, { notes: "Checked in store." })).ok).toBe(
      true,
    );
    expect(await stored(imported.id)).toMatchObject({
      notes: "Checked in store.",
      orderId: null,
      orderName: "#141909",
      lineItemId: null,
      lineItemTitle: null,
    });

    const arsenal = { id: ORDER_IDS.order141003, name: "#141003" };

    expect(
      (
        await edited(imported.id, {
          order: arsenal,
          lineItem: { id: LINE_ITEM_IDS.arsenal0304, title: "posted title" },
        })
      ).ok,
    ).toBe(true);
    expect(await stored(imported.id)).toMatchObject({
      orderId: ORDER_IDS.order141003,
      orderName: "#141003",
      lineItemId: LINE_ITEM_IDS.arsenal0304,
      lineItemTitle:
        "Dennis Bergkamp Signed Arsenal FC Original 2003–04 Away Shirt",
    });
    expect(
      await edited(imported.id, { order: arsenal, lineItem: null }),
    ).toEqual(
      invalid({ lineItem: "Select the item this certificate is for." }),
    );
  });

  it("answers not found when the certificate is deleted during its save", async () => {
    const product = fake.addProduct();
    const id = await created(input({ productId: product.id }));
    const graphql = fake.client.graphql;

    fake.client.graphql = (async (...call: Parameters<typeof graphql>) => {
      fake.client.graphql = graphql;
      await prisma.certificate.delete({ where: { id } });

      return graphql(...call);
    }) as typeof graphql;

    expect(await edited(id, { notes: "Too late." })).toEqual({
      ok: false,
      kind: "not_found",
    });
  });

  it("requires an order on create", async () => {
    expect(
      await createCertificate(
        context(),
        input({ order: null, lineItem: null }),
      ),
    ).toEqual(invalid({ order: "Select an order." }));
    expect(fake.calls).toEqual([]);
  });

  it("reports a failed file on its field and writes nothing", async () => {
    const photo = fake.addFile({
      kind: "photo",
      status: "FAILED",
      errorCode: "UNSUPPORTED_IMAGE_FILE_TYPE",
    });

    expect(
      await createCertificate(
        context(),
        input({ photo: { source: "file", fileId: photo.id } }),
      ),
    ).toEqual(invalid({ photo: "Upload a JPG, PNG, WEBP, or HEIC image." }));
    expect(await prisma.certificate.count()).toBe(0);
  });

  it("rolls back and answers unavailable when the database fails", async () => {
    vi.mocked(enqueueUpsert).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Can't reach database server", {
        code: "P1001",
        clientVersion: Prisma.prismaVersion.client,
      }),
    );

    expect(await createCertificate(context(), input())).toEqual({
      ok: false,
      kind: "unavailable",
    });
    expect(await prisma.certificate.count()).toBe(0);
    expect(events("certificate.save_failed")).toMatchObject([
      { shop: SHOP, error: "P1001" },
    ]);
  });
});

describe("pending media (spec §4.6 completePendingFiles, §12.4 #12)", () => {
  async function sharedPendingVideo() {
    const video = fake.addFile({ kind: "video", status: "PROCESSING" });
    const reference = { source: "file", fileId: video.id };
    const first = await created(input({ video: reference }));
    const second = await created(
      dortmund("IS141002RLBD1112", { video: reference }),
    );

    return { video, ids: [first, second] };
  }

  it("#12 completes a processing video shared by two certificates", async () => {
    const { video, ids } = await sharedPendingVideo();
    const before = await Promise.all(ids.map((id) => stored(id)));

    expect(before).toMatchObject([
      { videoFileId: video.id, videoUrl: null, version: 1 },
      { videoFileId: video.id, videoUrl: null, version: 1 },
    ]);

    fake.setFile(video.id, { status: "READY", sources: [mp4(720)] });

    expect(
      await completePendingFiles(context(), [video.id], { awaitMirror: true }),
    ).toEqual({ changedIds: ids });

    for (const [index, id] of ids.entries()) {
      expect(await stored(id)).toMatchObject({
        videoFileId: video.id,
        videoUrl: `${VIDEO_CDN}/720.mp4`,
        videoPreviewUrl: video.previewUrl,
        version: 2,
        updatedAt: before[index].updatedAt,
      });
    }

    expect(entryFields("is141002rlbm1516")?.video).toBe(`${VIDEO_CDN}/720.mp4`);
    expect(entryFields("is141002rlbd1112")?.video).toBe(`${VIDEO_CDN}/720.mp4`);
    expect(await prisma.syncFailure.count()).toBe(0);
  });

  it("#12 unlinks a failed video from both certificates until the next save", async () => {
    const { video, ids } = await sharedPendingVideo();

    fake.setFile(video.id, {
      status: "FAILED",
      errorCode: "VIDEO_MAX_DURATION_ERROR",
    });

    expect(
      await completePendingFiles(context(), [video.id], { awaitMirror: true }),
    ).toEqual({ changedIds: ids });

    for (const id of ids) {
      expect(await stored(id)).toMatchObject({
        videoFileId: null,
        videoUrl: null,
        videoError: "VIDEO_MAX_DURATION_ERROR",
        version: 2,
      });
    }

    expect(events("media.failed")).toMatchObject(
      ids.map((certificateId) => ({
        shop: SHOP,
        certificateId,
        kind: "video",
        code: "VIDEO_MAX_DURATION_ERROR",
      })),
    );
    expect(entryFields("is141002rlbm1516")).toMatchObject({
      video_error: "VIDEO_MAX_DURATION_ERROR",
    });
    expect(entryFields("is141002rlbm1516")).not.toHaveProperty("video_file_id");
    expect((await edited(ids[0])).ok).toBe(true);
    expect((await stored(ids[0])).videoError).toBeNull();
    expect((await stored(ids[1])).videoError).toBe("VIDEO_MAX_DURATION_ERROR");
  });

  it("records a file that disappeared as NOT_FOUND and leaves processing files alone", async () => {
    const photo = fake.addFile({ kind: "photo", status: "PROCESSING" });
    const video = fake.addFile({ kind: "video", status: "PROCESSING" });
    const id = await created(
      input({
        photo: { source: "file", fileId: photo.id },
        video: { source: "file", fileId: video.id },
      }),
    );

    fake.removeFile(photo.id);

    expect(await completePendingFiles(context(), [photo.id, video.id])).toEqual(
      {
        changedIds: [id],
      },
    );
    expect(await stored(id)).toMatchObject({
      photoFileId: null,
      photoError: "NOT_FOUND",
      videoFileId: video.id,
      videoUrl: null,
      videoError: null,
      version: 2,
    });
    expect(await completePendingFiles(context(), [video.id])).toEqual({
      changedIds: [],
    });
  });

  it("completeCertificateMedia reads only that certificate's pending files", async () => {
    const photo = fake.addFile({ kind: "photo", status: "PROCESSING" });
    const video = fake.addFile({ kind: "video", status: "PROCESSING" });
    const id = await created(
      input({ video: { source: "file", fileId: video.id } }),
    );

    await created(
      dortmund("IS141002RLBD1112", {
        photo: { source: "file", fileId: photo.id },
      }),
    );

    const readsBefore = fake.callsTo("CoaFileStatus").length;

    fake.setFile(video.id, { status: "READY", sources: [mp4(720)] });

    expect(await completeCertificateMedia(context(), id)).toBe("completed");
    expect(
      fake
        .callsTo("CoaFileStatus")
        .slice(readsBefore)
        .map((call) => call.variables.ids),
    ).toEqual([[video.id]]);
    expect(await stored(id)).toMatchObject({
      videoUrl: `${VIDEO_CDN}/720.mp4`,
      version: 2,
    });
    expect(await completeCertificateMedia(context(), testId(999999))).toBe(
      "not_found",
    );
  });

  it("reads statuses in chunks of 100 and changes nothing when Shopify can't be read", async () => {
    const ids = Array.from(
      { length: 150 },
      (unused, index) => `gid://shopify/MediaImage/${900 + index}`,
    );

    expect(await completePendingFiles(context(), ids)).toEqual({
      changedIds: [],
    });
    expect(
      fake
        .callsTo("CoaFileStatus")
        .map((call) => (call.variables.ids as string[]).length),
    ).toEqual([100, 50]);

    fake.failNext("CoaFileStatus", { throwResponse: 500 });

    expect(await completePendingFiles(context(), ids.slice(0, 1))).toEqual({
      changedIds: [],
    });
    expect(events("media.status_unavailable")).toMatchObject([
      { shop: SHOP, kind: "http" },
    ]);
  });

  it("completePendingInBackground asks Shopify at most once a minute per shop", async () => {
    const ready = fake.addFile({ kind: "video", status: "PROCESSING" });
    const waiting = fake.addFile({ kind: "video", status: "PROCESSING" });

    await created(input({ video: { source: "file", fileId: ready.id } }));
    await created(
      dortmund("IS141002RLBD1112", {
        video: { source: "file", fileId: waiting.id },
      }),
    );

    const statusReads = () => fake.callsTo("CoaFileStatus").length;
    const readsAfterSaves = statusReads();

    fake.setFile(ready.id, { status: "READY" });
    completePendingInBackground(context());
    completePendingInBackground(context());

    await vi.waitFor(() =>
      expect(entryFields("is141002rlbm1516")?.video).toBe(ready.url),
    );
    await flushBackgroundMirrors();

    expect(statusReads()).toBe(readsAfterSaves + 1);

    const later = Date.now() + 61_000;

    vi.spyOn(Date, "now").mockReturnValue(later);
    completePendingInBackground(context());

    await vi.waitFor(() => expect(statusReads()).toBe(readsAfterSaves + 2));
  });
});

describe("delete (spec §4.6 Delete)", () => {
  it("deletes this shop's certificates that still exist and their entries, never files", async () => {
    const first = await created(input());
    const second = await created(dortmund("IS141002RLBD1112"));
    const gone = await created(guler("IS141004AGRM2627"));
    const foreign = await createCertificateRow({}, { shop: OTHER_SHOP });

    await deleteCertificates(context(), [gone]);
    await flushBackgroundMirrors();

    const callsBefore = fake.calls.length;

    expect(
      await deleteCertificates(context(), [first, gone, foreign.id, second]),
    ).toEqual({
      deleted: [
        { id: first, code: "IS141002RLBM1516" },
        { id: second, code: "IS141002RLBD1112" },
      ],
    });

    await flushBackgroundMirrors();

    expect(fake.entries.size).toBe(0);
    expect(await prisma.syncFailure.count()).toBe(0);
    expect(await getCertificate(OTHER_SHOP, foreign.id)).not.toBeNull();
    expect(
      [
        ...new Set(fake.calls.slice(callsBefore).map((call) => call.operation)),
      ].sort(),
    ).toEqual(["CoaCertificateByHandle", "CoaCertificateDelete"]);
  });
});

describe("reads for the form (spec §4.6, §5)", () => {
  it("getDuplicateDraft copies everything but the code and the order link", async () => {
    const product = fake.addProduct({
      title: "Bayern Munich 2015-16 Home Shirt",
    });
    const video = fake.addFile({ kind: "video", status: "PROCESSING" });
    const id = await created(
      input({
        productId: product.id,
        photo: { source: "url", url: "https://example.com/proof.jpg" },
        video: { source: "file", fileId: video.id },
        notes: "Signed after the final.",
        signers: [
          { name: "Robert Lewandowski", date: null, location: "" },
          {
            name: "Thomas Müller",
            date: { precision: "MONTH", iso: "2016-05" },
            location: "Munich",
          },
        ],
      }),
    );

    fake.addProduct({ ...product, status: "DRAFT" });

    expect(await getDuplicateDraft(context(), id)).toEqual({
      values: {
        code: "",
        item: "Bayern Munich Football Shirt - 2015-16 Home",
        notes: "Signed after the final.",
        order: null,
        lineItem: null,
        product: {
          id: product.id,
          title: product.title,
          imageUrl: product.imageUrl,
          status: "DRAFT",
          missing: false,
        },
        photo: { source: "url", url: "https://example.com/proof.jpg" },
        video: {
          source: "file",
          fileId: video.id,
          url: null,
          previewUrl: null,
        },
        signers: [
          { name: "Robert Lewandowski", date: null, location: "" },
          {
            name: "Thomas Müller",
            date: { precision: "MONTH", iso: "2016-05" },
            location: "Munich",
          },
        ],
      },
      source: {
        code: "IS141002RLBM1516",
        item: "Bayern Munich Football Shirt - 2015-16 Home",
        signerNames: ["Robert Lewandowski", "Thomas Müller"],
        orderName: "#141002",
        productId: product.id,
      },
      sourceCode: "IS141002RLBM1516",
    });
    expect(await getDuplicateDraft(context(), testId(999999))).toBeNull();
  });

  it("getCertificateDetail builds the page from the database and one budgeted Shopify read", async () => {
    const photo = fake.addFile({ kind: "photo", status: "PROCESSING" });
    const video = fake.addFile({ kind: "video", status: "PROCESSING" });
    const id = await created(
      input({
        photo: { source: "file", fileId: photo.id },
        video: { source: "file", fileId: video.id },
      }),
    );
    const sibling = await created(dortmund("IS141002RLBD1112"));

    fake.setFile(photo.id, {
      status: "FAILED",
      errorCode: "INVALID_IMAGE_FILE_SIZE",
    });
    await completePendingFiles(context(), [photo.id, video.id], {
      awaitMirror: true,
    });
    // BST: late on 29 March and 26 September UTC are the next day in London.
    await prisma.certificate.update({
      where: { id },
      data: {
        createdAt: new Date("2026-03-29T23:30:00Z"),
        updatedAt: new Date("2026-09-26T23:30:00Z"),
      },
    });

    const detail = await getCertificateDetail(context(), id);

    expect(detail).toMatchObject({
      id,
      createdLabel: "30 Mar 2026",
      updatedLabel: "27 Sep 2026",
      pendingFileIds: [video.id],
      mediaErrors: { photo: "This photo is larger than 20 MB.", video: null },
      orderCard: {
        createdLabel: "26 Sep 2026 at 11:02",
        fulfillment: { label: "Unfulfilled", tone: "caution" },
        cancelled: false,
        selectableItems: 2,
        lineItem: { variantTitle: null, quantity: 1 },
      },
      orderCertificates: [
        {
          id: sibling,
          code: "IS141002RLBD1112",
          signers: "Robert Lewandowski",
          item: "Borussia Dortmund Football Shirt - 2011-12 Home",
          lineItemId: LINE_ITEM_IDS.dortmund,
        },
      ],
    });
    expect(events("certificate.detail_timing")).toEqual([
      expect.objectContaining({
        shop: SHOP,
        dbMs: expect.any(Number),
        adminMs: expect.any(Number),
      }),
    ]);

    fake.failNext("CoaOrderLineItems", { throwResponse: 500 });

    expect((await getCertificateDetail(context(), id))?.orderCard).toBeNull();
    expect(await getCertificateDetail(context(), testId(999999))).toBeNull();
  });

  it("getCertificateDetail shows the stored product when it can't be read and rethrows an expired session", async () => {
    const product = fake.addProduct({ title: "Bayern Munich Home Shirt" });
    const id = await created(input({ productId: product.id }));

    fake.failNext("CoaProducts", { throwResponse: 500 });

    expect((await getCertificateDetail(context(), id))?.values.product).toEqual(
      {
        id: product.id,
        title: "Bayern Munich Home Shirt",
        imageUrl: product.imageUrl,
        status: null,
        missing: false,
      },
    );

    fake.failNext("CoaProducts", { throwResponse: 401 });

    await expect(getCertificateDetail(context(), id)).rejects.toBeInstanceOf(
      Response,
    );
  });
});

describe("import and the code dictionary", () => {
  it("importCertificate writes the certificate and an upsert intent in one transaction", async () => {
    const createdAt = new Date("2024-02-03T04:05:06.789Z");
    const { id } = await importCertificate(
      SHOP,
      makeWrite({ orderName: "#141909" }),
      { createdAt },
    );

    expect(await stored(id)).toMatchObject({
      code: "IS141909ARS0",
      orderName: "#141909",
      createdAt,
      updatedAt: createdAt,
      version: 1,
    });
    expect(await getQueueRow(SHOP, id)).toMatchObject({
      action: "UPSERT",
      version: 1,
      handle: "is141909ars0",
      attempts: 0,
    });

    await expect(
      importCertificate(SHOP, makeWrite({ code: "IS141909ARS0" }), {
        createdAt,
      }),
    ).rejects.toThrow();
    expect(await prisma.certificate.count()).toBe(1);
    expect(await prisma.syncFailure.count()).toBe(1);
    expect(fake.calls).toEqual([]);
  });

  it("#23 a save shows in the code dictionary at once, even when the history stamp can't tell", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-27T10:00:00Z"));

    const id = await created(input());

    expect((await getCodeDictionary(context())).prefix).toBe("IS");

    const stamp = await historyStamp(SHOP);

    expect((await edited(id, { code: "XY141002RLBM1516" })).ok).toBe(true);
    expect(await historyStamp(SHOP)).toBe(stamp);
    expect((await getCodeDictionary(context())).prefix).toBe("XY");
  });
});
