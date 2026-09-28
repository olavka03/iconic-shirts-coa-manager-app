import { describe, expect, it } from "vitest";
import prisma from "~/.server/db/prisma.singleton";
import {
  createCertificateRow,
  OTHER_SHOP,
  SHOP,
} from "../../../tests/helpers/certificate-row.factory";
import {
  convertToDelete,
  countFailing,
  dueRows,
  enqueueAll,
  enqueueDelete,
  enqueueUpsert,
  getQueueRow,
  recordFailure,
  resolveDelete,
  resolveUpsert,
  shopsWithWork,
} from "./sync-queue.repository";
import { testId } from "../../../tests/helpers/test-ids.utils";

const failure = (
  certificateId: string,
  action: "UPSERT" | "DELETE",
  version = 1,
  handle = "x1111",
) =>
  recordFailure({
    shop: SHOP,
    certificateId,
    action,
    version,
    handle,
    error: "network:-: fetch failed",
  });

describe("SyncFailure state machine (spec §7.7)", () => {
  it("#1 a new certificate gets an UPSERT intent with attempts 0", async () => {
    const certificate = await createCertificateRow(
      { code: "IS141909ARS0" },
      { enqueue: true },
    );
    expect(await getQueueRow(SHOP, certificate.id)).toMatchObject({
      action: "UPSERT",
      version: 1,
      handle: "is141909ars0",
      staleHandles: [],
      attempts: 0,
      lastError: null,
    });
  });

  it("#2 an update moves version and handle, keeps attempts, lastError and createdAt; X → Y → X leaves [y]", async () => {
    const certificate = await createCertificateRow(
      { code: "X1111" },
      { enqueue: true },
    );
    await failure(certificate.id, "UPSERT");
    const before = await getQueueRow(SHOP, certificate.id);
    await prisma.$transaction((transaction) =>
      enqueueUpsert(transaction, {
        shop: SHOP,
        certificateId: certificate.id,
        version: 2,
        handle: "y2222",
        previousHandle: "x1111",
      }),
    );
    await prisma.$transaction((transaction) =>
      enqueueUpsert(transaction, {
        shop: SHOP,
        certificateId: certificate.id,
        version: 3,
        handle: "x1111",
        previousHandle: "y2222",
      }),
    );
    const row = await getQueueRow(SHOP, certificate.id);
    expect(row).toMatchObject({
      action: "UPSERT",
      version: 3,
      handle: "x1111",
      staleHandles: ["y2222"],
      attempts: 1,
      lastError: "network:-: fetch failed",
    });
    expect(row!.createdAt).toEqual(before!.createdAt);
  });

  it("#3 delete supersedes UPSERT and keeps staleHandles and attempts", async () => {
    const certificate = await createCertificateRow(
      { code: "Y2222" },
      { enqueue: true },
    );
    await prisma.$transaction((transaction) =>
      enqueueUpsert(transaction, {
        shop: SHOP,
        certificateId: certificate.id,
        version: 2,
        handle: "y2222",
        previousHandle: "x1111",
      }),
    );
    await failure(certificate.id, "UPSERT", 2, "y2222");
    await prisma.$transaction((transaction) =>
      enqueueDelete(transaction, {
        shop: SHOP,
        certificateId: certificate.id,
        version: 2,
        handle: "y2222",
      }),
    );
    expect(await getQueueRow(SHOP, certificate.id)).toMatchObject({
      action: "DELETE",
      handle: "y2222",
      staleHandles: ["x1111"],
      attempts: 1,
    });
  });

  it("#3 a delete under a different handle keeps the row's handle for removal and never lists its own", async () => {
    const certificate = await createCertificateRow({ code: "Y2222" });
    await prisma.$transaction((transaction) =>
      enqueueUpsert(transaction, {
        shop: SHOP,
        certificateId: certificate.id,
        version: 2,
        handle: "y2222",
        previousHandle: "x1111",
      }),
    );
    await prisma.$transaction((transaction) =>
      enqueueDelete(transaction, {
        shop: SHOP,
        certificateId: certificate.id,
        version: 1,
        handle: "x1111",
      }),
    );
    expect(await getQueueRow(SHOP, certificate.id)).toMatchObject({
      action: "DELETE",
      handle: "x1111",
      staleHandles: ["y2222"],
    });

    const secondCertificate = await createCertificateRow(
      { code: "V5555" },
      { enqueue: true },
    );
    await prisma.$transaction((transaction) =>
      enqueueDelete(transaction, {
        shop: SHOP,
        certificateId: secondCertificate.id,
        version: 2,
        handle: "u6666",
      }),
    );
    expect(await getQueueRow(SHOP, secondCertificate.id)).toMatchObject({
      action: "DELETE",
      handle: "u6666",
      staleHandles: ["v5555"],
    });
  });

  it("#4 and #7 UPSERT statements never touch a DELETE row", async () => {
    const certificate = await createCertificateRow(
      { code: "Z3333" },
      { enqueue: false },
    );
    await prisma.$transaction((transaction) =>
      enqueueDelete(transaction, {
        shop: SHOP,
        certificateId: certificate.id,
        version: 1,
        handle: "z3333",
      }),
    );
    await prisma.$transaction((transaction) =>
      enqueueUpsert(transaction, {
        shop: SHOP,
        certificateId: certificate.id,
        version: 5,
        handle: "z3333",
      }),
    );
    expect(await resolveUpsert(SHOP, certificate.id, 99)).toBe(0);
    await failure(certificate.id, "UPSERT", 5, "z3333");
    expect(await getQueueRow(SHOP, certificate.id)).toMatchObject({
      action: "DELETE",
      version: 1,
      attempts: 0,
    });
  });

  it("#5 a push resolves only rows with version ≤ the pushed version", async () => {
    const certificate = await createCertificateRow({}, { enqueue: true });
    await prisma.$transaction((transaction) =>
      enqueueUpsert(transaction, {
        shop: SHOP,
        certificateId: certificate.id,
        version: 3,
        handle: "is141909ars0",
      }),
    );
    expect(await resolveUpsert(SHOP, certificate.id, 2)).toBe(0);
    expect(await resolveUpsert(SHOP, certificate.id, 3)).toBe(1);
    expect(await getQueueRow(SHOP, certificate.id)).toBeNull();
  });

  it("#6 a failed push increments attempts; with no row it records one with attempts 1", async () => {
    const certificate = await createCertificateRow({}, { enqueue: true });
    await failure(certificate.id, "UPSERT");
    await failure(certificate.id, "UPSERT");
    expect(await getQueueRow(SHOP, certificate.id)).toMatchObject({
      attempts: 2,
      lastError: "network:-: fetch failed",
    });
    await resolveUpsert(SHOP, certificate.id, 1);
    await failure(certificate.id, "UPSERT", 1, "is141909ars0");
    expect(await getQueueRow(SHOP, certificate.id)).toMatchObject({
      action: "UPSERT",
      attempts: 1,
      handle: "is141909ars0",
    });
  });

  it("#8 and #9 delete rows: failures count, success removes only DELETE rows", async () => {
    const certificate = await createCertificateRow(
      { code: "W4444" },
      { enqueue: true },
    );
    expect(await resolveDelete(SHOP, certificate.id)).toBe(0);
    await prisma.$transaction((transaction) =>
      enqueueDelete(transaction, {
        shop: SHOP,
        certificateId: certificate.id,
        version: 1,
        handle: "w4444",
      }),
    );
    await failure(certificate.id, "DELETE", 1, "w4444");
    expect(await getQueueRow(SHOP, certificate.id)).toMatchObject({
      action: "DELETE",
      attempts: 1,
    });
    expect(await resolveDelete(SHOP, certificate.id)).toBe(1);
    expect(await getQueueRow(SHOP, certificate.id)).toBeNull();
  });

  it("#10 an UPSERT row whose certificate is gone becomes DELETE", async () => {
    const certificate = await createCertificateRow({}, { enqueue: true });
    await prisma.certificate.delete({ where: { id: certificate.id } });
    expect(await convertToDelete(SHOP, certificate.id)).toBe(1);
    expect(await getQueueRow(SHOP, certificate.id)).toMatchObject({
      action: "DELETE",
    });
  });

  it("an older push never deletes a newer intent (row lock + re-check under READ COMMITTED)", async () => {
    const certificate = await createCertificateRow({}, { enqueue: true });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const writer = prisma.$transaction(async (transaction) => {
      await enqueueUpsert(transaction, {
        shop: SHOP,
        certificateId: certificate.id,
        version: 2,
        handle: "is141909ars0",
      });
      await gate; // hold the row lock
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const resolving = resolveUpsert(SHOP, certificate.id, 1); // blocks on the row lock
    await new Promise((resolve) => setTimeout(resolve, 150));
    release();
    await writer;
    expect(await resolving).toBe(0);
    expect(await getQueueRow(SHOP, certificate.id)).toMatchObject({
      version: 2,
    });
  });

  it("dueRows skips fresh intents unless includeFresh, oldest first; countFailing counts attempts > 0", async () => {
    const fresh = await createCertificateRow(
      { code: "AAAA1" },
      { enqueue: true },
    );
    const failing = await createCertificateRow(
      { code: "BBBB1" },
      { enqueue: true },
    );
    await failure(failing.id, "UPSERT", 1, "bbbb1");
    const now = new Date();
    expect(
      (await dueRows(SHOP, now, { includeFresh: false })).map(
        (row) => row.certificateId,
      ),
    ).toEqual([failing.id]);
    expect(
      (await dueRows(SHOP, now, { includeFresh: true })).map(
        (row) => row.certificateId,
      ),
    ).toEqual([fresh.id, failing.id]);
    expect(
      (
        await dueRows(SHOP, new Date(now.getTime() + 16 * 60_000), {
          includeFresh: false,
        })
      ).map((row) => row.certificateId),
    ).toEqual([fresh.id, failing.id]);
    expect(await countFailing(SHOP)).toBe(1);
  });

  it("enqueueAll adds an UPSERT row for every certificate without one", async () => {
    await createCertificateRow({ code: "CCCC1" }, { enqueue: true });
    const unqueued = await createCertificateRow(
      { code: "DDDD1" },
      { enqueue: false },
    );
    expect(await enqueueAll(SHOP)).toBe(1);
    expect(await getQueueRow(SHOP, unqueued.id)).toMatchObject({
      action: "UPSERT",
      handle: "dddd1",
      attempts: 0,
    });
  });
});

describe("queue queries", () => {
  it("shopsWithWork lists every shop with certificates or queued rows, once", async () => {
    await createCertificateRow({ code: "AAAA1" });
    await createCertificateRow({ code: "AAAA2" });
    await createCertificateRow({ code: "AAAA1" }, { shop: OTHER_SHOP });
    await prisma.$transaction((transaction) =>
      enqueueDelete(transaction, {
        shop: "third-shop.myshopify.com",
        certificateId: testId(999999),
        version: 4,
        handle: "gone1",
      }),
    );
    expect(await shopsWithWork()).toEqual([
      OTHER_SHOP,
      SHOP,
      "third-shop.myshopify.com",
    ]);
  });

  it("countFailing and dueRows stay in their shop", async () => {
    const ownCertificate = await createCertificateRow({}, { enqueue: true });
    const otherCertificate = await createCertificateRow(
      {},
      { shop: OTHER_SHOP, enqueue: true },
    );
    await failure(ownCertificate.id, "UPSERT", 1, "is141909ars0");
    await recordFailure({
      shop: OTHER_SHOP,
      certificateId: otherCertificate.id,
      action: "UPSERT",
      version: 1,
      handle: "is141909ars0",
      error: "http_502",
    });
    expect(await countFailing(SHOP)).toBe(1);
    expect(await countFailing(OTHER_SHOP)).toBe(1);
    expect(
      (await dueRows(OTHER_SHOP, new Date(), { includeFresh: true })).map(
        (row) => row.certificateId,
      ),
    ).toEqual([otherCertificate.id]);
  });

  it("another shop's calls never read or change this shop's row", async () => {
    const certificate = await createCertificateRow({}, { enqueue: true });

    expect(await getQueueRow(OTHER_SHOP, certificate.id)).toBeNull();
    expect(await resolveUpsert(OTHER_SHOP, certificate.id, 99)).toBe(0);
    expect(await convertToDelete(OTHER_SHOP, certificate.id)).toBe(0);
    await recordFailure({
      shop: OTHER_SHOP,
      certificateId: certificate.id,
      action: "UPSERT",
      version: 1,
      handle: "is141909ars0",
      error: "http_502",
    });
    expect(await getQueueRow(SHOP, certificate.id)).toMatchObject({
      shop: SHOP,
      action: "UPSERT",
      attempts: 0,
      lastError: null,
    });

    await prisma.$transaction((transaction) =>
      enqueueDelete(transaction, {
        shop: SHOP,
        certificateId: certificate.id,
        version: 2,
        handle: "is141909ars0",
      }),
    );
    expect(await resolveDelete(OTHER_SHOP, certificate.id)).toBe(0);
    expect(await getQueueRow(SHOP, certificate.id)).toMatchObject({
      action: "DELETE",
    });
  });

  it("recordFailure keeps at most 1,000 characters of the error", async () => {
    const certificate = await createCertificateRow({}, { enqueue: true });
    await recordFailure({
      shop: SHOP,
      certificateId: certificate.id,
      action: "UPSERT",
      version: 1,
      handle: "is141909ars0",
      error: "x".repeat(1_500),
    });
    expect((await getQueueRow(SHOP, certificate.id))!.lastError).toHaveLength(
      1_000,
    );
  });

  it("enqueueDelete on a missing row starts with no stale handles", async () => {
    await prisma.$transaction((transaction) =>
      enqueueDelete(transaction, {
        shop: SHOP,
        certificateId: testId(42),
        version: 3,
        handle: "is141909ars0",
      }),
    );
    expect(await getQueueRow(SHOP, testId(42))).toMatchObject({
      shop: SHOP,
      action: "DELETE",
      version: 3,
      staleHandles: [],
      attempts: 0,
      lastError: null,
    });
  });
});
