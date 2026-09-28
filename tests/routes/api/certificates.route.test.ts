import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setSleepForTests } from "~/.server/gateways/admin-graphql.gateway";
import prisma from "~/.server/db/prisma.singleton";
import { getCertificate } from "~/.server/repositories/certificate.repository";
import {
  enqueueUpsert,
  getQueueRow,
} from "~/.server/repositories/sync-queue.repository";
import { action as collectionAction } from "~/routes/api/certificates.route";
import { action as certificateAction } from "~/routes/api/certificate-by-id.route";
import { getCertificateDetail } from "~/.server/services/certificates/certificate-read.service";
import { completeCertificateMedia } from "~/.server/services/certificates/media-completion.service";
import { dropCodeDictionary } from "~/.server/services/codes/codes.service";
import { flushBackgroundMirrors } from "~/.server/services/mirror/mirror-background.service";
import { resetMirrorMemos } from "~/.server/services/mirror/mirror-sync.service";
import { clearShopInfoCache } from "~/.server/services/shop/shop-info.service";
import { createFakeAdmin, type FakeAdmin } from "../../fakes/admin-api.fake";
import { LINE_ITEM_IDS, ORDER_IDS } from "../../fakes/orders.fake";
import {
  createCertificateRow,
  OTHER_SHOP,
  SHOP,
} from "../../helpers/certificate-row.factory";
import {
  jsonRequest,
  mockAdmin,
  readJson,
  routeArguments,
} from "../route-test.utils";
import { testId } from "../../helpers/test-ids.utils";

vi.mock("~/.server/shopify/shopify-app.config", () => ({
  authenticate: { admin: vi.fn() },
}));

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

vi.mock(
  "~/.server/services/certificates/media-completion.service",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/.server/services/certificates/media-completion.service")
      >();

    return {
      ...actual,
      completeCertificateMedia: vi.fn(actual.completeCertificateMedia),
    };
  },
);

vi.mock(
  "~/.server/services/certificates/certificate-read.service",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/.server/services/certificates/certificate-read.service")
      >();

    return {
      ...actual,
      getCertificateDetail: vi.fn(actual.getCertificateDetail),
    };
  },
);

let fake: FakeAdmin;

const BAYERN_TITLE =
  "Robert Lewandowski Signed Bayern Munich Football Shirt - 2015-16 Home";
const GULER_TITLE = "Arda Güler Signed Real Madrid 2026/27 Home Football Shirt";
const VIDEO_CDN = "https://cdn.shopify.com/videos/c/vp/0001";
const CODE_TAKEN =
  "This code is already used for Robert Lewandowski, Bayern Munich Football Shirt - 2015-16 Home.";
const CAPACITY =
  "All certificates for this item are already created. Select another item.";
const ITEM_GONE = "This item is no longer in the order. Select another item.";
const NOT_FOUND = { status: 404, body: { ok: false, formError: "not_found" } };

const adminContext = () => ({ shop: SHOP, admin: fake.client });

const values = (overrides: Record<string, unknown> = {}) => ({
  code: "IS141002RLBM1516",
  order: { id: ORDER_IDS.order141002, name: "#141002" },
  lineItem: { id: LINE_ITEM_IDS.bayern, title: BAYERN_TITLE },
  item: "Bayern Munich Football Shirt - 2015-16 Home",
  productId: null,
  productHint: null,
  photo: null,
  video: null,
  notes: "",
  signers: [{ name: "Robert Lewandowski", date: null, location: "" }],
  ...overrides,
});
const dortmund = (overrides: Record<string, unknown> = {}) =>
  values({
    code: "IS141002RLBD1112",
    lineItem: { id: LINE_ITEM_IDS.dortmund, title: "posted title" },
    item: "Borussia Dortmund Football Shirt - 2011-12 Home",
    ...overrides,
  });
const guler = (code: string) =>
  values({
    code,
    order: { id: ORDER_IDS.order141004, name: "#141004" },
    lineItem: { id: LINE_ITEM_IDS.guler, title: GULER_TITLE },
    item: "Real Madrid 2026/27 Home Football Shirt",
    signers: [{ name: "Arda Güler", date: null, location: "" }],
  });
const unlinked = (overrides: Record<string, unknown> = {}) =>
  values({ order: null, lineItem: null, ...overrides });

const postCollection = async (body: unknown) =>
  readJson(
    await collectionAction(
      routeArguments(jsonRequest("/api/certificates", body)),
    ),
  );
const postCertificate = async (id: string, body: unknown) =>
  readJson(
    await certificateAction(
      routeArguments(jsonRequest(`/api/certificates/${id}`, body), {
        id: String(id),
      }),
    ),
  );

async function created(
  submittedValues: Record<string, unknown>,
): Promise<string> {
  const { status, body } = await postCollection({
    intent: "create",
    values: submittedValues,
  });

  if (status !== 200) {
    throw new Error(`The create failed: ${JSON.stringify(body)}`);
  }

  await flushBackgroundMirrors();

  return (body as { id: string }).id;
}

function removeFromOrder(orderId: string, lineItemId: string) {
  const item = fake.orders
    .find((order) => order.id === orderId)
    ?.lineItems.find((lineItem) => lineItem.id === lineItemId);

  if (!item) {
    throw new Error(`The fake has no line item ${lineItemId}.`);
  }

  item.currentQuantity = 0;
}

const operationsSince = (index: number) =>
  [...new Set(fake.calls.slice(index).map((call) => call.operation))].sort();

beforeEach(() => {
  fake = createFakeAdmin();
  mockAdmin(fake);
  resetMirrorMemos();
  setSleepForTests(async () => {});
  clearShopInfoCache();
  dropCodeDictionary(SHOP);
});

afterEach(async () => {
  await flushBackgroundMirrors();
  setSleepForTests(null);
});

describe("POST /api/certificates create (spec §5, §12.5)", () => {
  it("answers with the new id and code and mirrors one entry", async () => {
    const response = await collectionAction(
      routeArguments(
        jsonRequest("/api/certificates", {
          intent: "create",
          values: values(),
        }),
      ),
    );

    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const { status, body } = await readJson(response);

    expect(status).toBe(200);
    expect(body).toEqual({
      ok: true,
      id: expect.any(String),
      code: "IS141002RLBM1516",
    });

    await flushBackgroundMirrors();

    expect([...fake.entries.keys()]).toEqual(["is141002rlbm1516"]);
  });

  it.each([
    undefined,
    { intent: "archive", values: values() },
    { intent: "create" },
    { intent: "create", values: 42 },
    { intent: "create", values: [values()] },
    { intent: "create", values: null },
  ])("answers 422 { ok: false } for the invalid body %j", async (body) => {
    expect(await postCollection(body)).toEqual({
      status: 422,
      body: { ok: false },
    });
    expect(await prisma.certificate.count()).toBe(0);
  });

  it("answers 422 with the field errors of invalid values", async () => {
    expect(
      await postCollection({
        intent: "create",
        values: values({
          item: "",
          signers: [{ name: "", date: null, location: "" }],
        }),
      }),
    ).toEqual({
      status: 422,
      body: {
        ok: false,
        fieldErrors: {
          item: "Enter the item name.",
          "signers.0.name": "Enter the signer's name.",
        },
      },
    });
  });

  it("requires an order on create", async () => {
    expect(
      await postCollection({ intent: "create", values: unlinked() }),
    ).toEqual({
      status: 422,
      body: { ok: false, fieldErrors: { order: "Select an order." } },
    });
  });

  it("requires the item when an order is selected", async () => {
    expect(
      await postCollection({
        intent: "create",
        values: values({ lineItem: null }),
      }),
    ).toEqual({
      status: 422,
      body: {
        ok: false,
        fieldErrors: { lineItem: "Select the item this certificate is for." },
      },
    });
  });

  it("names the certificate that already uses the code", async () => {
    await created(values());

    expect(
      await postCollection({
        intent: "create",
        values: dortmund({ code: "IS141002RLBM1516" }),
      }),
    ).toEqual({
      status: 422,
      body: { ok: false, fieldErrors: { code: CODE_TAKEN } },
    });
  });

  it("reports the item's capacity and an item that left the order on lineItem", async () => {
    await created(guler("IS141004AGRM2627"));
    await created(guler("IS141004AGRM2627-2"));
    removeFromOrder(ORDER_IDS.order141002, LINE_ITEM_IDS.dortmund);

    expect(
      await postCollection({
        intent: "create",
        values: guler("IS141004AGRM2627-3"),
      }),
    ).toEqual({
      status: 422,
      body: { ok: false, fieldErrors: { lineItem: CAPACITY } },
    });
    expect(
      await postCollection({ intent: "create", values: dortmund() }),
    ).toEqual({
      status: 422,
      body: { ok: false, fieldErrors: { lineItem: ITEM_GONE } },
    });
  });

  it("still answers ok when the mirror fails, keeping one retry row", async () => {
    fake.failNext("CoaCertificateUpsert", { throw: "network" });

    const id = await created(values());

    expect(await getQueueRow(SHOP, id)).toMatchObject({
      action: "UPSERT",
      attempts: 1,
    });
    expect(await prisma.syncFailure.count()).toBe(1);
  });

  it("lets an expired session at the order read reject the action and writes nothing", async () => {
    fake.failNext("CoaOrderLineItems", { throwResponse: 401 });

    await expect(
      collectionAction(
        routeArguments(
          jsonRequest("/api/certificates", {
            intent: "create",
            values: values(),
          }),
        ),
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(await prisma.certificate.count()).toBe(0);
  });

  it("keeps the save when the background mirror meets an expired session", async () => {
    fake.failNext("CoaCertificateUpsert", { throwResponse: 401 });

    const id = await created(values());

    expect(await getCertificate(SHOP, id)).not.toBeNull();
    expect(await prisma.syncFailure.count()).toBe(1);
  });

  it("answers 503 for a database failure other than a taken code or a missing row", async () => {
    vi.mocked(enqueueUpsert).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Can't reach database server", {
        code: "P1001",
        clientVersion: Prisma.prismaVersion.client,
      }),
    );

    expect(
      await postCollection({ intent: "create", values: values() }),
    ).toEqual({
      status: 503,
      body: { ok: false, formError: "unavailable" },
    });
    expect(await prisma.certificate.count()).toBe(0);
  });
});

describe("POST /api/certificates/:id update and complete-media (spec §5)", () => {
  it("answers with the saved certificate and keeps the stored link when no order is sent", async () => {
    const id = await created(values());

    const { status, body } = await postCertificate(id, {
      intent: "update",
      values: unlinked({ notes: "Signed at the training ground." }),
    });

    expect(status).toBe(200);
    expect(body).toEqual({
      ok: true,
      certificate: JSON.parse(
        JSON.stringify(await getCertificateDetail(adminContext(), id)),
      ),
    });
    expect(body).toMatchObject({
      certificate: {
        id,
        values: {
          notes: "Signed at the training ground.",
          order: { id: ORDER_IDS.order141002, name: "#141002" },
          lineItem: { id: LINE_ITEM_IDS.bayern, title: BAYERN_TITLE },
        },
      },
    });
    expect(await getCertificate(SHOP, id)).toMatchObject({
      orderId: ORDER_IDS.order141002,
      orderName: "#141002",
      lineItemId: LINE_ITEM_IDS.bayern,
      lineItemTitle: BAYERN_TITLE,
    });
  });

  it("reports a taken code and an item that left the order on their fields", async () => {
    await created(values());

    const legacy = await createCertificateRow({
      code: "IS141909ARS0",
      orderName: "#141909",
    });

    removeFromOrder(ORDER_IDS.order141002, LINE_ITEM_IDS.dortmund);

    expect(
      await postCertificate(legacy.id, {
        intent: "update",
        values: unlinked({ code: "IS141002RLBM1516" }),
      }),
    ).toEqual({
      status: 422,
      body: { ok: false, fieldErrors: { code: CODE_TAKEN } },
    });
    expect(
      await postCertificate(legacy.id, {
        intent: "update",
        values: dortmund({ code: "IS141909ARS0" }),
      }),
    ).toEqual({
      status: 422,
      body: { ok: false, fieldErrors: { lineItem: ITEM_GONE } },
    });
  });

  it("reports the item's capacity on lineItem when an update links a full item", async () => {
    await created(guler("IS141004AGRM2627"));
    await created(guler("IS141004AGRM2627-2"));
    const id = await created(values());

    expect(
      await postCertificate(id, {
        intent: "update",
        values: guler("IS141002RLBM1516"),
      }),
    ).toEqual({
      status: 422,
      body: { ok: false, fieldErrors: { lineItem: CAPACITY } },
    });
    expect(await getCertificate(SHOP, id)).toMatchObject({
      lineItemId: LINE_ITEM_IDS.bayern,
      version: 1,
    });
  });

  it("answers 503 for a database failure on update and leaves the row as it was", async () => {
    const id = await created(values());
    const before = await getCertificate(SHOP, id);
    vi.mocked(enqueueUpsert).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Can't reach database server", {
        code: "P1001",
        clientVersion: Prisma.prismaVersion.client,
      }),
    );

    expect(
      await postCertificate(id, {
        intent: "update",
        values: values({ notes: "Signed at the training ground." }),
      }),
    ).toEqual({
      status: 503,
      body: { ok: false, formError: "unavailable" },
    });
    expect(await getCertificate(SHOP, id)).toEqual(before);
  });

  it("answers 422 { ok: false } for an invalid body", async () => {
    const id = await created(values());

    for (const body of [
      undefined,
      { intent: "archive" },
      { intent: "update", values: "notes" },
    ]) {
      expect(await postCertificate(id, body)).toEqual({
        status: 422,
        body: { ok: false },
      });
    }
  });

  it("answers 404 for another shop's certificate and a malformed id", async () => {
    const foreign = await createCertificateRow({}, { shop: OTHER_SHOP });
    expect(
      await postCertificate(foreign.id, {
        intent: "update",
        values: unlinked({ code: "IS141909ARS0" }),
      }),
    ).toEqual(NOT_FOUND);
    expect(
      await postCertificate(foreign.id, { intent: "complete-media" }),
    ).toEqual(NOT_FOUND);

    for (const id of ["abc", "42", "-1"]) {
      expect(
        await postCertificate(id, { intent: "update", values: unlinked() }),
      ).toEqual(NOT_FOUND);
    }

    expect(await getCertificate(OTHER_SHOP, foreign.id)).toMatchObject({
      code: "IS141909ARS0",
      version: 1,
    });
  });

  it("completes a processed video and answers with the certificate", async () => {
    const video = fake.addFile({ kind: "video", status: "PROCESSING" });
    const id = await created(
      values({ video: { source: "file", fileId: video.id } }),
    );

    fake.setFile(video.id, {
      status: "READY",
      sources: [
        {
          url: `${VIDEO_CDN}/720.mp4`,
          format: "mp4",
          height: 720,
          mimeType: "video/mp4",
        },
      ],
    });

    const { status, body } = await postCertificate(id, {
      intent: "complete-media",
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      certificate: {
        id,
        pendingFileIds: [],
        values: {
          video: {
            source: "file",
            fileId: video.id,
            url: `${VIDEO_CDN}/720.mp4`,
            previewUrl: video.previewUrl,
          },
        },
      },
    });
    expect(await getCertificate(SHOP, id)).toMatchObject({
      videoUrl: `${VIDEO_CDN}/720.mp4`,
      version: 2,
    });
    expect(completeCertificateMedia).toHaveBeenLastCalledWith(
      expect.objectContaining({ shop: SHOP }),
      id,
    );
  });

  it("answers 404 when the certificate is gone by the time it is read back", async () => {
    const id = await created(values());
    vi.mocked(getCertificateDetail).mockResolvedValueOnce(null);

    expect(
      await postCertificate(id, { intent: "update", values: unlinked() }),
    ).toEqual(NOT_FOUND);

    vi.mocked(getCertificateDetail).mockResolvedValueOnce(null);

    expect(await postCertificate(id, { intent: "complete-media" })).toEqual(
      NOT_FOUND,
    );
  });

  it("answers with the unchanged certificate while its media is still processing", async () => {
    const video = fake.addFile({ kind: "video", status: "PROCESSING" });
    const id = await created(
      values({ video: { source: "file", fileId: video.id } }),
    );

    expect(
      await postCertificate(id, { intent: "complete-media" }),
    ).toMatchObject({
      status: 200,
      body: { ok: true, certificate: { id, pendingFileIds: [video.id] } },
    });
  });
});

describe("delete (spec §5, §6.7)", () => {
  it("deletes one certificate and answers ok again once it is gone", async () => {
    const id = await created(values());
    const callsBefore = fake.calls.length;

    for (let attempt = 0; attempt < 2; attempt++) {
      expect(await postCertificate(id, { intent: "delete" })).toEqual({
        status: 200,
        body: { ok: true },
      });
    }

    await flushBackgroundMirrors();

    expect(await getCertificate(SHOP, id)).toBeNull();
    expect(fake.entries.size).toBe(0);
    expect(operationsSince(callsBefore)).toEqual([
      "CoaCertificateByHandle",
      "CoaCertificateDelete",
    ]);
  });

  it("leaves another shop's certificate alone", async () => {
    const foreign = await createCertificateRow({}, { shop: OTHER_SHOP });

    expect(await postCertificate(foreign.id, { intent: "delete" })).toEqual({
      status: 200,
      body: { ok: true },
    });
    expect(await getCertificate(OTHER_SHOP, foreign.id)).not.toBeNull();
  });

  it("bulk deletes what still exists and lists only those", async () => {
    const first = await created(values());
    const gone = await created(dortmund());
    const last = await created(guler("IS141004AGRM2627"));

    await postCertificate(gone, { intent: "delete" });
    await flushBackgroundMirrors();

    const callsBefore = fake.calls.length;

    expect(
      await postCollection({ intent: "delete", ids: [first, gone, last] }),
    ).toEqual({
      status: 200,
      body: {
        ok: true,
        deleted: [
          { id: first, code: "IS141002RLBM1516" },
          { id: last, code: "IS141004AGRM2627" },
        ],
      },
    });

    await flushBackgroundMirrors();

    expect(await prisma.certificate.count()).toBe(0);
    expect(operationsSince(callsBefore)).toEqual([
      "CoaCertificateByHandle",
      "CoaCertificateDelete",
    ]);
  });

  it.each([
    [Array.from({ length: 101 }, (_unused, index) => testId(index + 1))],
    [[]],
    [[1]],
    [["1"]],
    [["abc"]],
    [[`${testId(1)}0`]],
  ])("answers 422 for the ids %j", async (ids) => {
    expect(await postCollection({ intent: "delete", ids })).toEqual({
      status: 422,
      body: { ok: false },
    });
  });
});
