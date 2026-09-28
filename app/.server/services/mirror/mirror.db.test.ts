import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/.server/db/prisma.singleton";
import {
  AdminApiError,
  setSleepForTests,
} from "~/.server/gateways/admin-graphql.gateway";
import { setLogSink, type LogLine } from "~/.server/logging/logger.service";
import {
  deleteCertificateRows,
  getCertificate,
  insertCertificate,
  updateCertificateRow,
} from "~/.server/repositories/certificate.repository";
import type { CertificateWrite } from "~/.server/repositories/certificate.types";
import {
  enqueueDelete,
  enqueueUpsert,
  getQueueRow,
} from "~/.server/repositories/sync-queue.repository";
import {
  createFakeAdmin,
  type FakeAdmin,
} from "../../../../tests/fakes/admin-api.fake";
import {
  createCertificateRow,
  makeWrite,
  OTHER_SHOP,
  SHOP,
} from "../../../../tests/helpers/certificate-row.factory";
import {
  deleteInBackground,
  flushBackgroundMirrors,
  pushInBackground,
} from "./mirror-background.service";
import { ensureDefinition } from "./mirror-definition.service";
import { formatSyncError, MirrorError } from "./mirror-errors.utils";
import { processQueue } from "./mirror-queue.service";
import { resetMirrorMemos, syncCertificate } from "./mirror-sync.service";
import {
  DEFINITION_FIELDS,
  DEFINITION_INPUT,
  toMetaobjectValues,
} from "./mirror-values.utils";
import { testId } from "../../../../tests/helpers/test-ids.utils";

let fake: FakeAdmin;
let logs: LogLine[];
const context = () => ({ shop: SHOP, admin: fake.client });

beforeEach(() => {
  fake = createFakeAdmin();
  logs = [];
  resetMirrorMemos();
  setSleepForTests(async () => {});
  setLogSink((line) => logs.push(line));
});

afterEach(() => {
  setSleepForTests(null);
  setLogSink(null);
  vi.restoreAllMocks();
});

const later = () => new Date(Date.now() + 16 * 60_000);
const handles = () => [...fake.entries.keys()].sort();
const events = (name: string) => logs.filter((line) => line.event === name);

async function save(overrides: Partial<CertificateWrite>, id?: string) {
  const saved = await prisma.$transaction(async (transaction) => {
    if (id === undefined) {
      const created = await insertCertificate(
        transaction,
        SHOP,
        makeWrite(overrides),
      );

      await enqueueUpsert(transaction, {
        shop: SHOP,
        certificateId: created.id,
        version: created.version,
        handle: created.code.toLowerCase(),
      });

      return created;
    }

    const current = (await getCertificate(SHOP, id))!;
    const updated = await updateCertificateRow(transaction, SHOP, id, {
      ...makeWrite(),
      ...current,
      ...overrides,
      signers: overrides.signers ?? current.signers,
    });

    await enqueueUpsert(transaction, {
      shop: SHOP,
      certificateId: id,
      version: updated.version,
      handle: updated.code.toLowerCase(),
      previousHandle:
        updated.previousCode !== updated.code
          ? updated.previousCode.toLowerCase()
          : null,
    });

    return updated;
  });

  pushInBackground(context(), saved.id);
  await flushBackgroundMirrors();

  return saved;
}

async function removeWithoutPush(ids: string[]) {
  await prisma.$transaction(async (transaction) => {
    for (const deleted of await deleteCertificateRows(transaction, SHOP, ids)) {
      await enqueueDelete(transaction, {
        shop: SHOP,
        certificateId: deleted.id,
        version: deleted.version,
        handle: deleted.code.toLowerCase(),
      });
    }
  });
}

async function remove(id: string) {
  await removeWithoutPush([id]);
  deleteInBackground(context(), [id]);
  await flushBackgroundMirrors();
}

type Graphql = FakeAdmin["client"]["graphql"];

function wrapGraphql(
  around: (
    query: string,
    options: unknown,
    inner: (query: string, options: unknown) => Promise<Response>,
  ) => Promise<Response>,
) {
  const inner = fake.client.graphql as unknown as (
    query: string,
    options: unknown,
  ) => Promise<Response>;

  fake.client.graphql = ((query: string, options?: unknown) =>
    around(query, options, inner)) as unknown as Graphql;
}

describe("mirror (spec §7.4–§7.7, §12.4)", () => {
  it("#1 a push writes exactly toMetaobjectValues under codeToHandle(code) and resolves the intent", async () => {
    const certificate = await save({ code: "IS141909ARS0" });

    expect(handles()).toEqual(["is141909ars0"]);
    expect(fake.entries.get("is141909ars0")!.fields).toEqual(
      toMetaobjectValues((await getCertificate(SHOP, certificate.id))!),
    );
    expect(await getQueueRow(SHOP, certificate.id)).toBeNull();
  });

  it("#1 sends the signers as a native JSON array", async () => {
    await save({ code: "IS141909ARS0" });

    const sent = fake.callsTo("CoaCertificateUpsert")[0].variables;

    expect(sent.values).toMatchObject({
      signers: [
        {
          name: "Thierry Henry",
          date_iso: "2019-11-28",
          date_precision: "day",
          location: "London, United Kingdom",
        },
      ],
    });
  });

  it("#3 a lost response and two code changes while Shopify is down end in one entry under the final handle", async () => {
    fake.failNext("CoaCertificateUpsert", { applyThenThrow: "timeout" });
    const certificate = await save({ code: "AAAA1" });

    fake.failNext("CoaCertificateUpsert", { throw: "network" }, 2);
    await save({ code: "BBBB1" }, certificate.id);
    await save({ code: "CCCC1" }, certificate.id);

    expect(await getQueueRow(SHOP, certificate.id)).toMatchObject({
      handle: "cccc1",
      staleHandles: ["aaaa1", "bbbb1"],
      attempts: 3,
    });

    const result = await processQueue(context(), {
      now: later(),
      includeFresh: false,
    });

    expect(result).toEqual({
      processed: 1,
      fixed: 1,
      stillFailing: 0,
      stuck: 0,
      stopped: null,
    });
    expect(handles()).toEqual(["cccc1"]);
    expect(await getQueueRow(SHOP, certificate.id)).toBeNull();
  });

  it("#4 X → Y → X while pushes fail leaves [y] and, after the job, only x", async () => {
    const certificate = await save({ code: "XXXX1" });

    fake.failNext("CoaCertificateUpsert", { throw: "network" }, 2);
    await save({ code: "YYYY1" }, certificate.id);
    await save({ code: "XXXX1" }, certificate.id);

    expect(await getQueueRow(SHOP, certificate.id)).toMatchObject({
      handle: "xxxx1",
      staleHandles: ["yyyy1"],
    });

    await processQueue(context(), { now: later(), includeFresh: false });

    expect(handles()).toEqual(["xxxx1"]);
  });

  it("#4 a code change after a synced create moves the entry to the new handle", async () => {
    const certificate = await save({ code: "OLDC1" });

    await save({ code: "NEWC1" }, certificate.id);

    expect(handles()).toEqual(["newc1"]);
    expect(await getQueueRow(SHOP, certificate.id)).toBeNull();
  });

  it("#5 code swap race: x ends with B's content, y with A's", async () => {
    const certificateA = await save({ code: "XXXX1", item: "Item A" });
    const oldFieldsOfA = { ...fake.entries.get("xxxx1")!.fields };

    fake.failNext("CoaCertificateUpsert", { throw: "network" });
    await save({ code: "YYYY1" }, certificateA.id);
    const certificateB = await save({
      code: "XXXX1",
      item: "Item B",
      signers: [{ name: "B Signer", date: null, location: null }],
    });

    fake.createEntryByHand("xxxx1", oldFieldsOfA);
    await processQueue(context(), { now: later(), includeFresh: false });
    await flushBackgroundMirrors();

    expect(handles()).toEqual(["xxxx1", "yyyy1"]);
    expect(fake.entries.get("xxxx1")!.fields.item).toBe("Item B");
    expect(fake.entries.get("yyyy1")!.fields.item).toBe("Item A");
    expect(await getQueueRow(SHOP, certificateA.id)).toBeNull();
    expect(await getQueueRow(SHOP, certificateB.id)).toBeNull();
  });

  it("#5 two certificates that swap codes while Shopify is down settle without pushing each other forever", async () => {
    const certificateA = await save({ code: "SWAPA", item: "Item A" });
    const certificateB = await save({ code: "SWAPB", item: "Item B" });

    fake.failNext("CoaCertificateUpsert", { throw: "network" }, 3);
    await save({ code: "SWAPT" }, certificateA.id);
    await save({ code: "SWAPA" }, certificateB.id);
    await save({ code: "SWAPB" }, certificateA.id);

    const result = await processQueue(context(), {
      now: later(),
      includeFresh: false,
    });

    expect(result).toMatchObject({ processed: 2, fixed: 2, stillFailing: 0 });
    expect(handles()).toEqual(["swapa", "swapb"]);
    expect(fake.entries.get("swapa")!.fields.item).toBe("Item B");
    expect(fake.entries.get("swapb")!.fields.item).toBe("Item A");
    expect(await getQueueRow(SHOP, certificateA.id)).toBeNull();
    expect(await getQueueRow(SHOP, certificateB.id)).toBeNull();
  });

  it("#6 a delete after a lost create removes the entry; after a failed create there is nothing to remove", async () => {
    fake.failNext("CoaCertificateUpsert", { applyThenThrow: "network" });
    const lostCreate = await save({ code: "DDDD1" });

    fake.failNext("CoaCertificateDelete", { throw: "network" });
    await remove(lostCreate.id);

    expect(await getQueueRow(SHOP, lostCreate.id)).toMatchObject({
      action: "DELETE",
      attempts: 2,
    });

    await processQueue(context(), { now: later(), includeFresh: false });

    expect(handles()).toEqual([]);
    expect(await getQueueRow(SHOP, lostCreate.id)).toBeNull();

    fake.failNext("CoaCertificateUpsert", { throw: "network" });
    const failedCreate = await save({ code: "EEEE1" });

    await remove(failedCreate.id);

    expect(await getQueueRow(SHOP, failedCreate.id)).toBeNull();
    expect(handles()).toEqual([]);
  });

  it("#6 a delete treats an entry already removed in the admin as done", async () => {
    const certificate = await save({ code: "GONE1" });

    fake.deleteEntryByHand("gone1");
    await remove(certificate.id);

    expect(await getQueueRow(SHOP, certificate.id)).toBeNull();
    expect(fake.callsTo("CoaCertificateDelete")).toHaveLength(0);
  });

  it("#7 code reuse: a failed delete of X never removes the new certificate's entry", async () => {
    const original = await save({ code: "SAME1", item: "Old" });

    fake.failNext("CoaCertificateDelete", { throw: "network" });
    await remove(original.id);
    const reused = await save({ code: "SAME1", item: "New" });

    await processQueue(context(), { now: later(), includeFresh: false });
    await flushBackgroundMirrors();

    expect(fake.entries.get("same1")!.fields.item).toBe("New");
    expect(await getQueueRow(SHOP, original.id)).toBeNull();
    expect(await getQueueRow(SHOP, reused.id)).toBeNull();
  });

  it("#8 a definition deleted in the admin is recreated and the save is mirrored", async () => {
    await save({ code: "FFFF1" });
    fake.deleteDefinition();
    await save({ code: "GGGG1" });

    expect(fake.definition).not.toBeNull();
    expect(handles()).toEqual(["gggg1"]);
  });

  it("#8 a field deleted in the admin is added back and the write retried once", async () => {
    await save({ code: "FLDA1" });
    fake.definition!.fields.delete("notes");
    const certificate = await save({
      code: "FLDB1",
      notes: "Signed at the club shop",
    });

    expect(fake.definition!.fields.get("notes")).toBe("multi_line_text_field");
    expect(fake.entries.get("fldb1")!.fields.notes).toBe(
      "Signed at the club shop",
    );
    expect(await getQueueRow(SHOP, certificate.id)).toBeNull();
  });

  it("#9 a push whose snapshot goes stale pushes again, so the entry ends at the latest version", async () => {
    const certificate = await save({ code: "HHHH1", item: "v1" });
    const once = { pending: true };

    wrapGraphql(async (query, options, inner) => {
      if (once.pending && query.includes("CoaCertificateUpsert")) {
        once.pending = false;
        const current = (await getCertificate(SHOP, certificate.id))!;

        await prisma.$transaction((transaction) =>
          updateCertificateRow(transaction, SHOP, certificate.id, {
            ...makeWrite(),
            ...current,
            item: "v3",
          }),
        );
      }

      return inner(query, options);
    });
    await prisma.$transaction((transaction) =>
      updateCertificateRow(transaction, SHOP, certificate.id, {
        ...makeWrite({ code: "HHHH1" }),
        item: "v2",
      }),
    );

    expect(await syncCertificate(context(), certificate.id)).toBe("synced");
    expect(fake.entries.get("hhhh1")!.fields.item).toBe("v3");
  });

  it("#9 a certificate that keeps changing during every push is left unsettled for the job", async () => {
    const certificate = await save({ code: "BUSY1", item: "v1" });
    const edits = { count: 0 };

    wrapGraphql(async (query, options, inner) => {
      if (query.includes("CoaCertificateUpsert")) {
        edits.count++;
        const current = (await getCertificate(SHOP, certificate.id))!;

        await prisma.$transaction((transaction) =>
          updateCertificateRow(transaction, SHOP, certificate.id, {
            ...makeWrite(),
            ...current,
            item: `edit ${edits.count}`,
          }),
        );
      }

      return inner(query, options);
    });

    expect(await syncCertificate(context(), certificate.id)).toBe("unsettled");
    expect(edits.count).toBe(3);
  });

  it("returns gone for a certificate that no longer exists", async () => {
    const certificate = await createCertificateRow({ code: "NONE1" });

    await prisma.$transaction((transaction) =>
      deleteCertificateRows(transaction, SHOP, [certificate.id]),
    );

    expect(await syncCertificate(context(), certificate.id)).toBe("gone");
    expect(fake.calls).toEqual([]);
  });

  it.each([
    { elementKey: "product" },
    { field: ["metaobject", "fields", "product"] },
    { field: ["values", "product"] },
  ])(
    "#11 INVALID_VALUE on the product (%j) clears the link and retries",
    async (where) => {
      const certificate = await save({
        code: "PPPP1",
        productId: "gid://shopify/Product/70001021",
        productTitle: "T",
        productImageUrl: null,
      });

      fake.failNext("CoaCertificateUpsert", {
        userError: {
          code: "INVALID_VALUE",
          message: "Value references a non-existent resource.",
          ...where,
        },
      });
      await save({ item: "changed" }, certificate.id);
      const stored = (await getCertificate(SHOP, certificate.id))!;

      expect(stored.productId).toBeNull();
      expect(stored.version).toBe(3);
      expect(fake.entries.get("pppp1")!.fields).not.toHaveProperty("product");
      expect(await getQueueRow(SHOP, certificate.id)).toBeNull();
      expect(events("mirror.product_reference_rejected")).toHaveLength(1);
    },
  );

  it("#11 a rename that commits while the product is rejected still removes the old entry", async () => {
    const certificate = await save({
      code: "RACE1",
      productId: "gid://shopify/Product/70001021",
      productTitle: "T",
    });
    const once = { pending: true };

    fake.failNext("CoaCertificateUpsert", {
      userError: {
        code: "INVALID_VALUE",
        message: "Value references a non-existent resource.",
        elementKey: "product",
      },
    });
    wrapGraphql(async (query, options, inner) => {
      if (once.pending && query.includes("CoaCertificateUpsert")) {
        once.pending = false;
        const current = (await getCertificate(SHOP, certificate.id))!;

        await prisma.$transaction(async (transaction) => {
          const updated = await updateCertificateRow(
            transaction,
            SHOP,
            certificate.id,
            {
              ...makeWrite(),
              ...current,
              code: "RACE2",
            },
          );

          await enqueueUpsert(transaction, {
            shop: SHOP,
            certificateId: certificate.id,
            version: updated.version,
            handle: "race2",
            previousHandle: "race1",
          });
        });
      }

      return inner(query, options);
    });

    expect(await syncCertificate(context(), certificate.id)).toBe("synced");
    expect(handles()).toEqual(["race2"]);
    expect(fake.entries.get("race2")!.fields).not.toHaveProperty("product");
    expect(await getQueueRow(SHOP, certificate.id)).toBeNull();
  });

  it("#11 INVALID_VALUE on another field is recorded, not retried", async () => {
    fake.failNext("CoaCertificateUpsert", {
      userError: {
        code: "INVALID_VALUE",
        message: "Value is invalid.",
        elementKey: "photo",
      },
    });
    const certificate = await save({ code: "QQQQ1" });

    expect(await getQueueRow(SHOP, certificate.id)).toMatchObject({
      attempts: 1,
      lastError: "user_error:INVALID_VALUE: Value is invalid.",
    });
    expect(fake.callsTo("CoaCertificateUpsert")).toHaveLength(1);
  });

  it("a failed background push leaves exactly one row with the failure recorded", async () => {
    fake.failNext("CoaCertificateUpsert", { throw: "network" }, 2);
    const certificate = await save({ code: "IIII1" });

    await save({ item: "again" }, certificate.id);
    const row = await getQueueRow(SHOP, certificate.id);

    expect(row).toMatchObject({ action: "UPSERT", attempts: 2, version: 2 });
    expect(row!.lastError).toMatch(/^network:/);
    expect(await prisma.syncFailure.count()).toBe(1);
    expect(events("mirror.sync_failed")[0]).toMatchObject({
      shop: SHOP,
      certificateId: certificate.id,
      kind: "network",
    });
  });

  it("a failed background delete keeps the DELETE row with the failure recorded", async () => {
    const certificate = await save({ code: "DELF1" });

    fake.failNext("CoaCertificateDelete", { throwResponse: 500 });
    await remove(certificate.id);

    expect(await getQueueRow(SHOP, certificate.id)).toMatchObject({
      action: "DELETE",
      attempts: 1,
      lastError: "http:500: HTTP 500",
    });
    expect(handles()).toEqual(["delf1"]);
  });
});

describe("ensureDefinition (spec §7.1)", () => {
  it("creates the definition with exactly DEFINITION_INPUT and never sends admin access", async () => {
    await ensureDefinition(fake.client, SHOP);

    const [create] = fake.callsTo("CoaDefinitionCreate");

    expect(create.variables.definition).toEqual(DEFINITION_INPUT);
    expect(
      (create.variables.definition as typeof DEFINITION_INPUT).fieldDefinitions,
    ).toHaveLength(24);
    expect(create.variables.definition).not.toHaveProperty("access.admin");
    expect([...fake.definition!.fields.keys()]).toEqual(
      DEFINITION_FIELDS.map((field) => field.key),
    );
  });

  it("reads the definition once per shop for 10 minutes; force reads it again", async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);

    await ensureDefinition(fake.client, SHOP);
    await ensureDefinition(fake.client, SHOP);

    expect(fake.callsTo("CoaDefinitionByType")).toHaveLength(1);

    await ensureDefinition(fake.client, SHOP, { force: true });

    expect(fake.callsTo("CoaDefinitionByType")).toHaveLength(2);

    clock.mockReturnValue(now + 10 * 60_000 + 1);
    await ensureDefinition(fake.client, SHOP);

    expect(fake.callsTo("CoaDefinitionByType")).toHaveLength(3);
  });

  it("shares one read between concurrent callers", async () => {
    await Promise.all([
      ensureDefinition(fake.client, SHOP),
      ensureDefinition(fake.client, SHOP),
      ensureDefinition(fake.client, SHOP),
    ]);

    expect(fake.callsTo("CoaDefinitionByType")).toHaveLength(1);
    expect(fake.callsTo("CoaDefinitionCreate")).toHaveLength(1);
  });

  it("drops the memo after a failure, so the next call reads again", async () => {
    fake.failNext("CoaDefinitionByType", { throw: "network" });

    await expect(ensureDefinition(fake.client, SHOP)).rejects.toMatchObject({
      kind: "network",
    });
    await ensureDefinition(fake.client, SHOP);

    expect(fake.callsTo("CoaDefinitionByType")).toHaveLength(2);
    expect(fake.definition).not.toBeNull();
  });

  it("keeps a forced call's memo when an older call fails after it", async () => {
    fake.failNext("CoaDefinitionByType", { throw: "network" });

    const failing = ensureDefinition(fake.client, SHOP);
    const forced = ensureDefinition(fake.client, SHOP, { force: true });

    await expect(failing).rejects.toMatchObject({ kind: "network" });
    await forced;
    await ensureDefinition(fake.client, SHOP);

    expect(fake.callsTo("CoaDefinitionByType")).toHaveLength(2);
  });

  it("adds two missing keys with one update", async () => {
    const missing = ["certificate_id", "line_item_id"];

    fake.definition = {
      id: "gid://shopify/MetaobjectDefinition/900",
      fields: new Map(
        DEFINITION_FIELDS.filter((field) => !missing.includes(field.key)).map(
          (field) => [field.key, field.type],
        ),
      ),
    };
    await ensureDefinition(fake.client, SHOP);

    const updates = fake.callsTo("CoaDefinitionUpdate");

    expect(updates).toHaveLength(1);
    expect(updates[0].variables).toEqual({
      id: "gid://shopify/MetaobjectDefinition/900",
      definition: {
        fieldDefinitions: [
          {
            create: {
              key: "certificate_id",
              name: "Certificate ID",
              type: "single_line_text_field",
            },
          },
          {
            create: {
              key: "line_item_id",
              name: "Line item ID",
              type: "single_line_text_field",
            },
          },
        ],
      },
    });
    expect(fake.definition!.fields.size).toBe(24);
  });

  it("logs a key with another type and changes nothing", async () => {
    fake.definition = {
      id: "gid://shopify/MetaobjectDefinition/901",
      fields: new Map(
        DEFINITION_FIELDS.map((field) => [
          field.key,
          field.key === "notes" ? "single_line_text_field" : field.type,
        ]),
      ),
    };
    await ensureDefinition(fake.client, SHOP);

    expect(events("mirror.definition_conflict")).toEqual([
      expect.objectContaining({
        level: "warn",
        shop: SHOP,
        key: "notes",
        expected: "multi_line_text_field",
        actual: "single_line_text_field",
      }),
    ]);
    expect(fake.callsTo("CoaDefinitionUpdate")).toHaveLength(0);
    expect(fake.definition!.fields.get("notes")).toBe("single_line_text_field");
  });

  it("re-reads after TAKEN on create (another process created it first)", async () => {
    wrapGraphql(async (query, options, inner) => {
      if (query.includes("CoaDefinitionCreate")) {
        await inner(query, options);
      }

      return inner(query, options);
    });

    await ensureDefinition(fake.client, SHOP);

    expect(fake.callsTo("CoaDefinitionByType")).toHaveLength(2);
    expect(fake.callsTo("CoaDefinitionUpdate")).toHaveLength(0);
    expect(fake.definition!.fields.size).toBe(24);
  });

  it("throws a MirrorError for any other userError on create", async () => {
    fake.failNext("CoaDefinitionCreate", {
      userError: { code: "MAX_DEFINITIONS_EXCEEDED", message: "Too many." },
    });

    const thrown = await ensureDefinition(fake.client, SHOP).catch(
      (error: unknown) => error,
    );

    expect(thrown).toBeInstanceOf(MirrorError);
    expect(thrown).toMatchObject({ code: "MAX_DEFINITIONS_EXCEEDED" });
  });
});

describe("processQueue (spec §7.8)", () => {
  it("skips an intent row younger than 15 minutes unless includeFresh is set", async () => {
    const certificate = await createCertificateRow(
      { code: "MMMM1" },
      { enqueue: true },
    );

    expect(
      await processQueue(context(), { now: new Date(), includeFresh: false }),
    ).toMatchObject({ processed: 0 });
    expect(handles()).toEqual([]);

    expect(
      await processQueue(context(), { now: new Date(), includeFresh: true }),
    ).toMatchObject({ processed: 1, fixed: 1 });
    expect(handles()).toEqual(["mmmm1"]);
    expect(await getQueueRow(SHOP, certificate.id)).toBeNull();
  });

  it("picks up a stale intent row after 15 minutes", async () => {
    const certificate = await createCertificateRow(
      { code: "NNNN1" },
      { enqueue: true },
    );

    await processQueue(context(), { now: later(), includeFresh: false });

    expect(handles()).toEqual(["nnnn1"]);
    expect(await getQueueRow(SHOP, certificate.id)).toBeNull();
  });

  it("counts a row reaching 7 attempts as stuck and logs job.stuck", async () => {
    fake.failNext("CoaCertificateUpsert", { throw: "network" });
    const certificate = await save({ code: "STCK1" });

    await prisma.syncFailure.update({
      where: { certificateId: certificate.id },
      data: { attempts: 6 },
    });
    fake.failNext("CoaCertificateUpsert", { throw: "network" });
    const result = await processQueue(context(), {
      now: later(),
      includeFresh: false,
    });

    expect(result).toEqual({
      processed: 1,
      fixed: 0,
      stillFailing: 1,
      stuck: 1,
      stopped: null,
    });
    expect(await getQueueRow(SHOP, certificate.id)).toMatchObject({
      attempts: 7,
    });
    expect(events("job.stuck")).toEqual([
      expect.objectContaining({
        shop: SHOP,
        certificateId: certificate.id,
        attempts: 7,
      }),
    ]);
  });

  it("stops a shop on access_denied and leaves later rows untouched", async () => {
    fake.failNext("CoaCertificateUpsert", { throw: "network" }, 2);
    const first = await save({ code: "JJJJ1" });
    const second = await save({ code: "KKKK1" });

    fake.failNext("CoaCertificateUpsert", { throw: "access_denied" });
    const result = await processQueue(context(), {
      now: later(),
      includeFresh: false,
    });

    expect(result).toMatchObject({ processed: 1, stopped: "access_denied" });
    expect((await getQueueRow(SHOP, first.id))!.attempts).toBe(2);
    expect((await getQueueRow(SHOP, second.id))!.attempts).toBe(1);
  });

  it("stops a shop on auth", async () => {
    fake.failNext("CoaCertificateUpsert", { throw: "network" }, 2);
    await save({ code: "AUTH1" });
    await save({ code: "AUTH2" });

    fake.failNext("CoaCertificateUpsert", { throwResponse: 401 });
    const result = await processQueue(context(), {
      now: later(),
      includeFresh: false,
    });

    expect(result).toMatchObject({
      processed: 1,
      stopped: "auth",
      stillFailing: 2,
    });
  });

  it("keeps going after an ordinary failure", async () => {
    fake.failNext("CoaCertificateUpsert", { throw: "network" }, 2);
    const first = await save({ code: "GOON1" });
    const second = await save({ code: "GOON2" });

    fake.failNext("CoaCertificateUpsert", { throw: "network" });
    const result = await processQueue(context(), {
      now: later(),
      includeFresh: false,
    });

    expect(result).toEqual({
      processed: 2,
      fixed: 1,
      stillFailing: 1,
      stuck: 0,
      stopped: null,
    });
    expect((await getQueueRow(SHOP, first.id))!.attempts).toBe(2);
    expect(await getQueueRow(SHOP, second.id)).toBeNull();
  });

  it("converts an UPSERT row of a deleted certificate into a DELETE and cleans it up", async () => {
    const certificate = await save({ code: "LLLL1" });

    fake.failNext("CoaCertificateUpsert", { throw: "network" });
    await save({ item: "edited" }, certificate.id);
    await prisma.$transaction((transaction) =>
      deleteCertificateRows(transaction, SHOP, [certificate.id]),
    );

    fake.failNext("CoaCertificateDelete", { throw: "network" });
    await processQueue(context(), { now: later(), includeFresh: false });

    expect(await getQueueRow(SHOP, certificate.id)).toMatchObject({
      action: "DELETE",
      attempts: 2,
    });
    expect(handles()).toEqual(["llll1"]);

    const result = await processQueue(context(), {
      now: later(),
      includeFresh: false,
    });

    expect(result).toMatchObject({ processed: 1, fixed: 1, stillFailing: 0 });
    expect(handles()).toEqual([]);
    expect(await getQueueRow(SHOP, certificate.id)).toBeNull();
  });

  it("paces its Shopify calls", async () => {
    fake.failNext("CoaCertificateUpsert", { throw: "network" });
    await save({ code: "PACE1" });
    fake.throttleStatus = { ...fake.throttleStatus, currentlyAvailable: 50 };
    const waits: number[] = [];

    setSleepForTests(async (delay) => {
      waits.push(delay);
    });
    await processQueue(context(), { now: later(), includeFresh: false });

    expect(waits.length).toBeGreaterThan(0);
  });
});

describe("deleteInBackground (spec §7.5, §7.6)", () => {
  it("removes five entries with at most four deletes in flight", async () => {
    const ids: string[] = [];

    for (const code of ["CONA1", "CONB1", "CONC1", "COND1", "CONE1"]) {
      ids.push((await save({ code })).id);
    }

    const flight = { active: 0, peak: 0 };

    wrapGraphql(async (query, options, inner) => {
      if (!query.includes("CoaCertificateDelete")) {
        return inner(query, options);
      }

      flight.active++;
      flight.peak = Math.max(flight.peak, flight.active);
      await new Promise((resolve) => setTimeout(resolve, 100));

      try {
        return await inner(query, options);
      } finally {
        flight.active--;
      }
    });
    await removeWithoutPush(ids);
    deleteInBackground(context(), ids);
    await flushBackgroundMirrors();

    expect(flight.peak).toBe(4);
    expect(fake.callsTo("CoaCertificateDelete")).toHaveLength(5);
    expect(handles()).toEqual([]);
    expect(await prisma.syncFailure.count()).toBe(0);
  });

  it("ignores ids without a DELETE row", async () => {
    const certificate = await save({ code: "KEEP1" });

    deleteInBackground(context(), [certificate.id, testId(999999)]);
    await flushBackgroundMirrors();

    expect(handles()).toEqual(["keep1"]);
    expect(fake.callsTo("CoaCertificateByHandle")).toHaveLength(0);
  });

  it("never acts on another shop's DELETE row", async () => {
    const other = await createCertificateRow(
      { code: "OTHR1" },
      { shop: OTHER_SHOP },
    );

    await prisma.$transaction(async (transaction) => {
      await deleteCertificateRows(transaction, OTHER_SHOP, [other.id]);
      await enqueueDelete(transaction, {
        shop: OTHER_SHOP,
        certificateId: other.id,
        version: other.version,
        handle: "othr1",
      });
    });
    fake.createEntryByHand("othr1", { code: "OTHR1" });
    deleteInBackground(context(), [other.id]);
    await flushBackgroundMirrors();

    expect(handles()).toEqual(["othr1"]);
    expect(await getQueueRow(OTHER_SHOP, other.id)).toMatchObject({
      action: "DELETE",
    });
  });
});

describe("formatSyncError", () => {
  it("formats each failure kind as kind:code: message", () => {
    expect(formatSyncError(new AdminApiError("network", "fetch failed"))).toBe(
      "network:-: fetch failed",
    );
    expect(
      formatSyncError(new MirrorError("INVALID_VALUE", "Value is invalid.")),
    ).toBe("user_error:INVALID_VALUE: Value is invalid.");
    expect(
      formatSyncError(
        new AdminApiError("http", "HTTP 500", {
          status: 500,
          response: new Response("", { status: 500 }),
        }),
      ),
    ).toBe("http:500: HTTP 500");
    expect(formatSyncError(new Response("", { status: 500 }))).toBe(
      "http:500: HTTP 500",
    );
    expect(
      formatSyncError(
        new AdminApiError("throttled", "Throttled", { code: "THROTTLED" }),
      ),
    ).toBe("throttled:THROTTLED: Throttled");
    expect(formatSyncError(new TypeError("boom"))).toBe(
      "internal:TypeError: boom",
    );
  });

  it("cuts the text at 1,000 characters", () => {
    const text = formatSyncError(
      new AdminApiError("graphql", "x".repeat(2000)),
    );

    expect(text).toHaveLength(1000);
    expect(text.startsWith("graphql:-: xxx")).toBe(true);
  });
});
