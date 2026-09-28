import { HttpResponseError, InvalidJwtError } from "@shopify/shopify-api";
import { SessionNotFoundError } from "@shopify/shopify-app-react-router/server";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import prisma from "~/.server/db/prisma.singleton";
import { setSleepForTests } from "~/.server/gateways/admin-graphql.gateway";
import { setLogSink, type LogLine } from "~/.server/logging/logger.service";
import { getCertificate } from "~/.server/repositories/certificate.repository";
import {
  enqueueUpsert,
  getQueueRow,
} from "~/.server/repositories/sync-queue.repository";
import {
  resetMirrorMemos,
  syncCertificate,
} from "~/.server/services/mirror/mirror-sync.service";
import { toMetaobjectValues } from "~/.server/services/mirror/mirror-values.utils";
import {
  createFakeAdmin,
  type FakeAdmin,
} from "../../../tests/fakes/admin-api.fake";
import {
  createCertificateRow,
  OTHER_SHOP,
  SHOP,
} from "../../../tests/helpers/certificate-row.factory";
import type { AdminForShop } from "~/.server/shopify/admin-for-shop.service";
import { reconcileShop } from "./reconcile.job";
import {
  runSyncRetryJob,
  type JobDependencies,
  type ShopJobResult,
} from "./sync-retry.job";

type CreatedCertificate = Awaited<ReturnType<typeof createCertificateRow>>;

const RESULT_KEYS: (keyof ShopJobResult)[] = [
  "entriesRecreated",
  "fixed",
  "mediaResolved",
  "processed",
  "shop",
  "stillFailing",
  "stuck",
  "untrackedEntries",
];
const WRITE_OPERATIONS = new Set([
  "CoaCertificateUpsert",
  "CoaCertificateDelete",
  "CoaDefinitionCreate",
  "CoaDefinitionUpdate",
]);

let fake: FakeAdmin;
let logs: LogLine[];
let adminForShop: Mock<AdminForShop>;
let sleep: Mock<JobDependencies["sleep"]>;

const context = () => ({ shop: SHOP, admin: fake.client });
const dependencies = (): JobDependencies => ({ adminForShop, sleep });
const handles = () => [...fake.entries.keys()].sort();
const writes = () =>
  fake.calls.filter((call) => WRITE_OPERATIONS.has(call.operation));
const events = (name: string) => logs.filter((line) => line.event === name);
const queueRows = () =>
  prisma.syncFailure.findMany({ orderBy: { certificateId: "asc" } });
const minutesLater = (minutes: number) =>
  new Date(Date.now() + minutes * 60_000);

beforeEach(() => {
  fake = createFakeAdmin();
  logs = [];
  resetMirrorMemos();
  setSleepForTests(async () => {});
  setLogSink((line) => logs.push(line));
  adminForShop = vi.fn<AdminForShop>(async (shop) => ({
    shop,
    admin: fake.client,
  }));
  sleep = vi.fn<JobDependencies["sleep"]>(async () => {});
});

afterEach(() => {
  setSleepForTests(null);
  setLogSink(null);
});

async function certificateWithEntry(code: string) {
  const certificate = await createCertificateRow({ code }, { enqueue: true });

  await syncCertificate(context(), certificate.id);

  return certificate;
}

async function markFailing(certificate: CreatedCertificate, attempts = 1) {
  await prisma.$transaction((transaction) =>
    enqueueUpsert(transaction, {
      shop: SHOP,
      certificateId: certificate.id,
      version: certificate.version,
      handle: certificate.code.toLowerCase(),
    }),
  );
  await prisma.syncFailure.update({
    where: { certificateId: certificate.id },
    data: { attempts, lastError: "network:-: fetch failed" },
  });
}

async function failingCertificate(code: string, attempts = 1) {
  const certificate = await createCertificateRow({ code });

  await markFailing(certificate, attempts);

  return certificate;
}

async function expectEntryMatchesRecord(id: string) {
  const record = await getCertificate(SHOP, id);

  expect(fake.entries.get(record!.code.toLowerCase())?.fields).toEqual(
    toMetaobjectValues(record!),
  );
}

describe("runSyncRetryJob (spec §7.8)", () => {
  it("returns every key of ShopJobResult for a shop that ran", async () => {
    await failingCertificate("IS141001AAA1");

    const results = await runSyncRetryJob({}, dependencies());

    expect(results).toHaveLength(1);
    expect(Object.keys(results[0]).sort()).toEqual(RESULT_KEYS);
    expect(results[0]).toEqual({
      shop: SHOP,
      processed: 1,
      fixed: 1,
      stillFailing: 0,
      stuck: 0,
      mediaResolved: 0,
      untrackedEntries: 0,
      entriesRecreated: 0,
    });
  });

  it("runs every shop with work in order and only the named shop with --shop", async () => {
    await failingCertificate("IS141001AAA1");
    await createCertificateRow({ code: "IS141001BBB1" }, { shop: OTHER_SHOP });

    const everyShop = await runSyncRetryJob({}, dependencies());
    const oneShop = await runSyncRetryJob({ shop: OTHER_SHOP }, dependencies());

    expect(everyShop.map((result) => result.shop)).toEqual([OTHER_SHOP, SHOP]);
    expect(oneShop.map((result) => result.shop)).toEqual([OTHER_SHOP]);
    expect(adminForShop.mock.calls).toEqual([
      [OTHER_SHOP],
      [SHOP],
      [OTHER_SHOP],
    ]);
  });

  it("completes pending media and mirrors the certificate", async () => {
    const photo = fake.addFile({ kind: "photo" });
    const certificate = await createCertificateRow({
      code: "IS141001MED1",
      photoFileId: photo.id,
    });

    const [result] = await runSyncRetryJob({}, dependencies());

    expect(result).toMatchObject({ mediaResolved: 1, entriesRecreated: 0 });
    expect((await getCertificate(SHOP, certificate.id))!.photoUrl).toBe(
      photo.url,
    );
    await expectEntryMatchesRecord(certificate.id);
    expect(await queueRows()).toEqual([]);
  });

  it("--all enqueues every certificate without a row, and the next run pushes them", async () => {
    const stale = await certificateWithEntry("IS141001ALL1");
    const failing = await certificateWithEntry("IS141001ALL2");

    await markFailing(failing, 2);
    fake.createEntryByHand("is141001all1", { code: "IS141001ALL1" });

    const [withoutAll] = await runSyncRetryJob({}, dependencies());

    expect(withoutAll).toMatchObject({ processed: 1, fixed: 1 });
    expect(await queueRows()).toEqual([]);

    const [withAll] = await runSyncRetryJob({ all: true }, dependencies());

    expect(withAll).toMatchObject({ processed: 0, stillFailing: 0 });
    expect(fake.entries.get("is141001all1")!.fields).toEqual({
      code: "IS141001ALL1",
    });
    expect(await queueRows()).toEqual([
      expect.objectContaining({ certificateId: stale.id, attempts: 0 }),
      expect.objectContaining({ certificateId: failing.id, attempts: 0 }),
    ]);

    const [nextRun] = await runSyncRetryJob(
      { now: minutesLater(16) },
      dependencies(),
    );

    expect(nextRun).toMatchObject({ processed: 2, fixed: 2, stillFailing: 0 });
    await expectEntryMatchesRecord(stale.id);
    await expectEntryMatchesRecord(failing.id);
    expect(await queueRows()).toEqual([]);
  });

  it("--dry-run lists the work without a Shopify call or a write", async () => {
    await failingCertificate("IS141001DRY1", 2);
    await createCertificateRow({
      code: "IS141001DRY2",
      photoFileId: fake.addFile({ kind: "photo" }).id,
    });
    await certificateWithEntry("IS141001DRY3");
    fake.deleteEntryByHand("is141001dry3");
    await createCertificateRow({ code: "IS141001DRY4" }, { enqueue: true });
    const rowsBefore = await queueRows();
    const certificatesBefore = await prisma.certificate.findMany();

    fake.calls.length = 0;
    const results = await runSyncRetryJob({ dryRun: true }, dependencies());

    expect(results).toEqual([
      {
        shop: SHOP,
        processed: 1,
        fixed: 0,
        stillFailing: 1,
        stuck: 0,
        mediaResolved: 1,
        untrackedEntries: 0,
        entriesRecreated: 0,
      },
    ]);
    expect(fake.calls).toEqual([]);
    expect(adminForShop).not.toHaveBeenCalled();
    expect(await queueRows()).toEqual(rowsBefore);
    expect(await prisma.certificate.findMany()).toEqual(certificatesBefore);
  });

  it("--dry-run --all enqueues nothing and counts only the rows due now", async () => {
    await failingCertificate("IS141001DRA1");
    await certificateWithEntry("IS141001DRA2");
    await certificateWithEntry("IS141001DRA3");

    fake.calls.length = 0;
    const [result] = await runSyncRetryJob(
      { dryRun: true, all: true },
      dependencies(),
    );

    expect(result).toMatchObject({ processed: 1, stillFailing: 1 });
    expect(fake.calls).toEqual([]);
    expect(await queueRows()).toHaveLength(1);
  });

  it("re-creates a deleted definition before the queue step, even with a warm memo", async () => {
    const certificate = await certificateWithEntry("IS141001DEF2");

    await markFailing(certificate);
    fake.deleteDefinition();
    fake.calls.length = 0;

    const [result] = await runSyncRetryJob({}, dependencies());

    expect(fake.calls.slice(0, 3).map((call) => call.operation)).toEqual([
      "CoaDefinitionByType",
      "CoaDefinitionCreate",
      "CoaCertificateUpsert",
    ]);
    expect(fake.callsTo("CoaCertificateUpsert")).toHaveLength(1);
    expect(result).toMatchObject({ processed: 1, fixed: 1, stillFailing: 0 });
    await expectEntryMatchesRecord(certificate.id);
  });

  it("counts only rows with attempts > 0 as still failing", async () => {
    const fresh = await certificateWithEntry("IS141001FRS1");
    const failing = await certificateWithEntry("IS141001FRS2");

    await prisma.$transaction((transaction) =>
      enqueueUpsert(transaction, {
        shop: SHOP,
        certificateId: fresh.id,
        version: fresh.version,
        handle: "is141001frs1",
      }),
    );
    await markFailing(failing);
    fake.failNext("CoaCertificateUpsert", { throw: "network" });

    const [result] = await runSyncRetryJob({}, dependencies());

    expect(result).toMatchObject({ processed: 1, fixed: 0, stillFailing: 1 });
    expect(await queueRows()).toHaveLength(2);
    expect(await getQueueRow(SHOP, fresh.id)).toMatchObject({ attempts: 0 });
  });

  it("logs job.stuck when a row reaches 7 attempts", async () => {
    const certificate = await certificateWithEntry("IS141001STK1");

    await markFailing(certificate, 6);
    fake.failNext("CoaCertificateUpsert", { throw: "network" });

    const [result] = await runSyncRetryJob({}, dependencies());

    expect(result).toMatchObject({ stuck: 1, stillFailing: 1 });
    expect(events("job.stuck")).toEqual([
      expect.objectContaining({
        shop: SHOP,
        certificateId: certificate.id,
        attempts: 7,
      }),
    ]);
  });
});

describe("#15 reconcile sweep (spec §7.4, §12.4)", () => {
  it("keeps and counts an entry made by hand for a code that doesn't exist", async () => {
    await certificateWithEntry("IS141001LIV1");
    fake.createEntryByHand("is999999zzz1", { code: "IS999999ZZZ1" });

    const [result] = await runSyncRetryJob({}, dependencies());

    expect(result).toMatchObject({ untrackedEntries: 1, entriesRecreated: 0 });
    expect(handles()).toEqual(["is141001liv1", "is999999zzz1"]);
    expect(fake.callsTo("CoaCertificateDelete")).toEqual([]);
    expect(events("job.untracked_entries")).toEqual([
      expect.objectContaining({ shop: SHOP, count: 1 }),
    ]);
  });

  it("re-creates an entry deleted by hand and leaves live entries untouched", async () => {
    const untouched = await certificateWithEntry("IS141001LIV1");
    const deleted = await certificateWithEntry("IS141001DEL1");
    const untouchedFields = structuredClone(
      fake.entries.get("is141001liv1")!.fields,
    );

    fake.deleteEntryByHand("is141001del1");
    fake.calls.length = 0;
    const [result] = await runSyncRetryJob({}, dependencies());

    expect(result).toMatchObject({ untrackedEntries: 0, entriesRecreated: 1 });
    expect(handles()).toEqual(["is141001del1", "is141001liv1"]);
    await expectEntryMatchesRecord(deleted.id);
    expect(fake.entries.get("is141001liv1")!.fields).toEqual(untouchedFields);
    expect(
      fake
        .callsTo("CoaCertificateUpsert")
        .map((call) => (call.variables.handle as { handle: string }).handle),
    ).toEqual(["is141001del1"]);
    expect(await getQueueRow(SHOP, deleted.id)).toBeNull();
    expect(await getQueueRow(SHOP, untouched.id)).toBeNull();
  });

  it("keeps a failed re-creation queued and counts it as still failing", async () => {
    const certificate = await certificateWithEntry("IS141001RCF1");

    fake.deleteEntryByHand("is141001rcf1");
    fake.failNext("CoaCertificateUpsert", { throw: "network" });

    const [result] = await runSyncRetryJob({}, dependencies());

    expect(result).toMatchObject({ entriesRecreated: 1, stillFailing: 1 });
    expect(await getQueueRow(SHOP, certificate.id)).toMatchObject({
      action: "UPSERT",
      attempts: 1,
    });
    expect(handles()).toEqual([]);
  });

  it("leaves a certificate with a queue row to the queue step", async () => {
    const certificate = await certificateWithEntry("IS141001QUE1");

    fake.deleteEntryByHand("is141001que1");
    await markFailing(certificate);
    fake.failNext("CoaCertificateUpsert", { throw: "network" });

    const [result] = await runSyncRetryJob({}, dependencies());

    expect(result).toMatchObject({ entriesRecreated: 0, stillFailing: 1 });
    expect(fake.callsTo("CoaCertificateUpsert")).toHaveLength(2);
    expect(await getQueueRow(SHOP, certificate.id)).toMatchObject({
      attempts: 2,
    });
  });

  it("with 0 certificates in the shop (wiped database) deletes nothing and writes nothing", async () => {
    await certificateWithEntry("IS141001WIP1");
    await certificateWithEntry("IS141001WIP2");
    await prisma.$executeRawUnsafe("TRUNCATE certificates CASCADE");
    fake.calls.length = 0;

    expect(await runSyncRetryJob({}, dependencies())).toEqual([]);

    const [named] = await runSyncRetryJob({ shop: SHOP }, dependencies());

    expect(named).toMatchObject({ untrackedEntries: 0, entriesRecreated: 0 });
    expect(handles()).toEqual(["is141001wip1", "is141001wip2"]);
    expect(writes()).toEqual([]);
    expect(fake.callsTo("CoaCertificateEntries")).toEqual([]);
  });

  it("reconcileShop makes no Shopify call for a shop without certificates", async () => {
    fake.createEntryByHand("is141001wip1", { code: "IS141001WIP1" });

    expect(await reconcileShop(context())).toEqual({
      untrackedEntries: 0,
      entriesRecreated: 0,
    });
    expect(fake.calls).toEqual([]);
  });

  it("two overlapping job runs end in the same state as one", async () => {
    const live = await certificateWithEntry("IS141001OVL1");
    const deleted = await certificateWithEntry("IS141001OVL2");
    const failing = await failingCertificate("IS141001OVL3");

    fake.deleteEntryByHand("is141001ovl2");
    fake.createEntryByHand("is999999ovl9", { code: "IS999999OVL9" });

    const results = await Promise.all([
      runSyncRetryJob({}, dependencies()),
      runSyncRetryJob({}, dependencies()),
    ]);

    expect(results.flat().map((result) => result.skipped)).toEqual([
      undefined,
      undefined,
    ]);
    expect(handles()).toEqual([
      "is141001ovl1",
      "is141001ovl2",
      "is141001ovl3",
      "is999999ovl9",
    ]);

    for (const certificate of [live, deleted, failing]) {
      await expectEntryMatchesRecord(certificate.id);
    }

    expect(await queueRows()).toEqual([]);

    const [again] = await runSyncRetryJob({}, dependencies());

    expect(again).toMatchObject({
      processed: 0,
      stillFailing: 0,
      untrackedEntries: 1,
      entriesRecreated: 0,
    });
  });
});

describe("#16 stopping and skipping a shop (spec §7.8, §12.4)", () => {
  it.each([
    ["access_denied", { throw: "access_denied" as const }],
    ["auth", { throwResponse: 401 as const }],
  ])(
    "stops the shop on %s: later rows keep their attempts and no sweep runs",
    async (_stop, failure) => {
      const first = await failingCertificate("IS141001STP1");
      const second = await failingCertificate("IS141001STP2");

      await certificateWithEntry("IS141001STP3");
      fake.deleteEntryByHand("is141001stp3");
      fake.calls.length = 0;
      fake.failNext("CoaCertificateUpsert", failure);

      const [result] = await runSyncRetryJob({}, dependencies());

      expect(result).toMatchObject({
        processed: 1,
        fixed: 0,
        stillFailing: 2,
        untrackedEntries: 0,
        entriesRecreated: 0,
      });
      expect(await getQueueRow(SHOP, first.id)).toMatchObject({ attempts: 2 });
      expect(await getQueueRow(SHOP, second.id)).toMatchObject({ attempts: 1 });
      expect(fake.callsTo("CoaCertificateEntries")).toEqual([]);
      expect(handles()).not.toContain("is141001stp3");
    },
  );

  it.each([
    ["an invalid JWT", new InvalidJwtError("Failed to parse session token")],
    [
      "a rejected refresh token",
      new HttpResponseError({
        message: "Bad Request",
        code: 400,
        statusText: "Bad Request",
        body: { error: "invalid_subject_token" },
      }),
    ],
  ])(
    "skips the shop at once on %s and logs job.reauth_required",
    async (_label, error) => {
      const certificate = await failingCertificate("IS141001REA1");

      adminForShop.mockRejectedValue(error);

      const results = await runSyncRetryJob({}, dependencies());

      expect(results).toEqual([
        {
          shop: SHOP,
          processed: 0,
          fixed: 0,
          stillFailing: 0,
          stuck: 0,
          mediaResolved: 0,
          untrackedEntries: 0,
          entriesRecreated: 0,
          skipped: "reauth_required",
        },
      ]);
      expect(sleep).not.toHaveBeenCalled();
      expect(adminForShop).toHaveBeenCalledTimes(1);
      expect(events("job.reauth_required")).toEqual([
        expect.objectContaining({ shop: SHOP }),
      ]);
      expect(await getQueueRow(SHOP, certificate.id)).toMatchObject({
        attempts: 1,
      });
    },
  );

  it("waits 30 s after a failed token refresh, tries once more, then skips the shop", async () => {
    const certificate = await failingCertificate("IS141001UNA1");

    adminForShop.mockRejectedValue(new Response(null, { status: 500 }));

    const [result] = await runSyncRetryJob({}, dependencies());

    expect(result).toMatchObject({ skipped: "unavailable", processed: 0 });
    expect(sleep.mock.calls).toEqual([[30_000]]);
    expect(adminForShop).toHaveBeenCalledTimes(2);
    expect(fake.calls).toEqual([]);
    expect(await getQueueRow(SHOP, certificate.id)).toMatchObject({
      attempts: 1,
    });
  });

  it("runs the shop when the second try succeeds", async () => {
    await failingCertificate("IS141001UNA2");
    adminForShop.mockRejectedValueOnce(new TypeError("fetch failed"));

    const [result] = await runSyncRetryJob({}, dependencies());

    expect(result.skipped).toBeUndefined();
    expect(result).toMatchObject({ processed: 1, fixed: 1 });
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("skips a shop without an offline session and keeps its rows", async () => {
    const certificate = await failingCertificate("IS141001NOS1");

    adminForShop.mockRejectedValue(
      new SessionNotFoundError("Could not find a session for shop"),
    );

    const [result] = await runSyncRetryJob({}, dependencies());

    expect(result).toMatchObject({ skipped: "no_session", processed: 0 });
    expect(sleep).not.toHaveBeenCalled();
    expect(await getQueueRow(SHOP, certificate.id)).toMatchObject({
      attempts: 1,
    });
  });

  it("logs job.shop_failed for any other error and runs the next shop", async () => {
    await failingCertificate("IS141001FAT1");
    await createCertificateRow(
      { code: "IS141001FAT2" },
      { shop: OTHER_SHOP, enqueue: true },
    );
    adminForShop.mockImplementation(async (shop) => {
      if (shop === OTHER_SHOP) {
        throw new Error("Unexpected");
      }

      return { shop, admin: fake.client };
    });

    const results = await runSyncRetryJob({}, dependencies());

    expect(results.map((result) => [result.shop, result.skipped])).toEqual([
      [OTHER_SHOP, "unavailable"],
      [SHOP, undefined],
    ]);
    expect(results[1]).toMatchObject({ processed: 1, fixed: 1 });
    expect(events("job.shop_failed")).toEqual([
      expect.objectContaining({ shop: OTHER_SHOP, error: "Error" }),
    ]);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("catches a failure inside a shop's run and keeps the shop's rows", async () => {
    const certificate = await failingCertificate("IS141001DEF1");

    fake.failNext("CoaDefinitionByType", { throw: "network" });

    const [result] = await runSyncRetryJob({}, dependencies());

    expect(result).toMatchObject({ skipped: "unavailable", processed: 0 });
    expect(events("job.shop_failed")).toEqual([
      expect.objectContaining({ shop: SHOP, error: "AdminApiError" }),
    ]);
    expect(await getQueueRow(SHOP, certificate.id)).toMatchObject({
      attempts: 1,
    });
  });
});
