import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFakeAdmin,
  type FakeAdmin,
} from "../../../tests/fakes/admin-api.fake";
import { setSleepForTests } from "./admin-graphql.gateway";
import {
  addDefinitionFields,
  COA_TYPE,
  createDefinition,
  deleteEntry,
  findEntryByHandle,
  getDefinition,
  listEntries,
  upsertEntry,
  type DefinitionInput,
} from "./metaobjects.gateway";

const INPUT: DefinitionInput = {
  type: COA_TYPE,
  name: "Certificate of authenticity",
  description: "Certificates kept by the app.",
  displayNameKey: "code",
  access: { storefront: "NONE" },
  fieldDefinitions: [
    {
      key: "code",
      name: "Code",
      type: "single_line_text_field",
      required: true,
    },
    { key: "item", name: "Item", type: "single_line_text_field" },
  ],
};

let fake: FakeAdmin;
let sleeps: number[];

beforeEach(() => {
  fake = createFakeAdmin();
  sleeps = [];
  setSleepForTests(async (durationMs) => {
    sleeps.push(durationMs);
  });
});

afterEach(() => setSleepForTests(null));

async function withDefinition() {
  const created = await createDefinition(fake.client, INPUT);

  if (!created.ok) {
    throw new Error(created.message);
  }

  return created.id;
}

describe("definition", () => {
  it("is null before it exists", async () => {
    expect(await getDefinition(fake.client)).toBeNull();
    expect(fake.callsTo("CoaDefinitionByType")[0].variables).toEqual({
      type: "coa_certificate",
    });
  });

  it("is created and then lists its fields", async () => {
    const id = await withDefinition();

    expect(await getDefinition(fake.client)).toEqual({
      id,
      fields: [
        { key: "code", type: "single_line_text_field" },
        { key: "item", type: "single_line_text_field" },
      ],
    });
  });

  it("is sent without an admin access key", async () => {
    const withAdmin = {
      ...INPUT,
      access: { storefront: "NONE", admin: "MERCHANT_READ_WRITE" },
    } as unknown as DefinitionInput;

    expect((await createDefinition(fake.client, withAdmin)).ok).toBe(true);
    expect(fake.callsTo("CoaDefinitionCreate")[0].variables.definition).toEqual(
      {
        type: "coa_certificate",
        name: "Certificate of authenticity",
        description: "Certificates kept by the app.",
        displayNameKey: "code",
        access: { storefront: "NONE" },
        fieldDefinitions: [
          {
            key: "code",
            name: "Code",
            type: "single_line_text_field",
            required: true,
          },
          { key: "item", name: "Item", type: "single_line_text_field" },
        ],
      },
    );
  });

  it("returns TAKEN when it already exists", async () => {
    await withDefinition();

    expect(await createDefinition(fake.client, INPUT)).toMatchObject({
      ok: false,
      code: "TAKEN",
      field: ["definition", "type"],
    });
  });

  it("gets new fields added as create operations", async () => {
    const id = await withDefinition();

    expect(
      await addDefinitionFields(fake.client, id, [
        { key: "notes", name: "Notes", type: "multi_line_text_field" },
      ]),
    ).toEqual({ ok: true });
    expect(fake.callsTo("CoaDefinitionUpdate")[0].variables).toEqual({
      id,
      definition: {
        fieldDefinitions: [
          {
            create: {
              key: "notes",
              name: "Notes",
              type: "multi_line_text_field",
            },
          },
        ],
      },
    });
    expect((await getDefinition(fake.client))?.fields).toContainEqual({
      key: "notes",
      type: "multi_line_text_field",
    });
  });

  it("returns TAKEN for a field that already exists", async () => {
    const id = await withDefinition();

    expect(
      await addDefinitionFields(fake.client, id, [
        { key: "item", name: "Item", type: "single_line_text_field" },
      ]),
    ).toMatchObject({ ok: false, code: "TAKEN" });
  });
});

describe("entries", () => {
  it("upserts under one handle, replacing every value", async () => {
    await withDefinition();

    const first = await upsertEntry(fake.client, "is141002rlbm1516", {
      code: "IS141002RLBM1516",
      item: "First",
    });
    const second = await upsertEntry(fake.client, "is141002rlbm1516", {
      code: "IS141002RLBM1516",
    });

    expect(first).toMatchObject({ ok: true, handle: "is141002rlbm1516" });
    expect(second).toEqual(first);
    expect(fake.entries.size).toBe(1);
    expect(fake.entries.get("is141002rlbm1516")?.fields).toEqual({
      code: "IS141002RLBM1516",
    });
    expect(fake.callsTo("CoaCertificateUpsert")[1].variables).toEqual({
      handle: { type: "coa_certificate", handle: "is141002rlbm1516" },
      values: { code: "IS141002RLBM1516" },
    });
  });

  it("sends the values as one object, native arrays included", async () => {
    const id = await withDefinition();

    await addDefinitionFields(fake.client, id, [
      { key: "signers", name: "Signers", type: "json" },
    ]);

    const signers = [{ name: "Alan Shearer", date_iso: null }];

    await upsertEntry(fake.client, "abcd1", { code: "ABCD1", signers });

    expect(fake.callsTo("CoaCertificateUpsert")[0].variables).toEqual({
      handle: { type: "coa_certificate", handle: "abcd1" },
      values: { code: "ABCD1", signers },
    });
    expect(fake.entries.get("abcd1")?.fields).toEqual({
      code: "ABCD1",
      signers,
    });
  });

  it("returns UNDEFINED_OBJECT_TYPE without a definition", async () => {
    expect(
      await upsertEntry(fake.client, "abcd1", { code: "ABCD1" }),
    ).toMatchObject({
      ok: false,
      code: "UNDEFINED_OBJECT_TYPE",
    });
  });

  it("returns UNDEFINED_OBJECT_FIELD with the key of an unknown field", async () => {
    await withDefinition();

    expect(
      await upsertEntry(fake.client, "abcd1", {
        code: "ABCD1",
        product: "gid://shopify/Product/1",
      }),
    ).toEqual({
      ok: false,
      code: "UNDEFINED_OBJECT_FIELD",
      field: ["values"],
      elementKey: "product",
      message: 'No field definition found for "product"',
    });
  });

  it("passes an injected user error on unchanged", async () => {
    await withDefinition();
    fake.failNext("CoaCertificateUpsert", {
      userError: {
        code: "INVALID_VALUE",
        message: "Value references a non-existent resource.",
        elementKey: "product",
      },
    });

    expect(await upsertEntry(fake.client, "abcd1", { code: "ABCD1" })).toEqual({
      ok: false,
      code: "INVALID_VALUE",
      field: undefined,
      elementKey: "product",
      message: "Value references a non-existent resource.",
    });
    expect(fake.entries.size).toBe(0);
  });

  it("deletes an entry, and treats a missing one as deleted", async () => {
    await withDefinition();

    const entry = await upsertEntry(fake.client, "abcd1", { code: "ABCD1" });
    const id = entry.ok ? entry.id : "";

    expect(await deleteEntry(fake.client, id)).toEqual({ ok: true });
    expect(fake.entries.size).toBe(0);
    expect(await deleteEntry(fake.client, id)).toEqual({ ok: true });
  });

  it("reports other delete errors", async () => {
    fake.failNext("CoaCertificateDelete", {
      userError: { code: "INTERNAL_ERROR", message: "Something went wrong." },
    });

    expect(
      await deleteEntry(fake.client, "gid://shopify/Metaobject/1"),
    ).toEqual({
      ok: false,
      code: "INTERNAL_ERROR",
      message: "Something went wrong.",
    });
  });

  it("finds an entry by handle", async () => {
    await withDefinition();

    const entry = await upsertEntry(fake.client, "abcd1", { code: "ABCD1" });

    expect(await findEntryByHandle(fake.client, "abcd1")).toEqual({
      id: entry.ok ? entry.id : "",
      handle: "abcd1",
    });
    expect(await findEntryByHandle(fake.client, "zzzz1")).toBeNull();
  });

  it("lists every entry in pages of 250, pacing each page", async () => {
    await withDefinition();

    for (let index = 0; index < 600; index++) {
      fake.createEntryByHand(`e${index}`, { code: `E${index}` });
    }

    fake.throttleStatus.currentlyAvailable = 50;

    const handles: string[] = [];

    for await (const entry of listEntries(fake.client)) {
      handles.push(entry.handle);
    }

    expect(handles).toHaveLength(600);
    expect(new Set(handles).size).toBe(600);
    expect(handles[0]).toBe("e0");
    expect(
      fake.callsTo("CoaCertificateEntries").map((call) => call.variables.after),
    ).toEqual([null, "250", "500"]);
    expect(sleeps).toEqual([500, 500, 500]);
  });

  it("lists nothing for an empty type", async () => {
    const all: unknown[] = [];

    for await (const entry of listEntries(fake.client)) {
      all.push(entry);
    }

    expect(all).toEqual([]);
    expect(fake.callsTo("CoaCertificateEntries")).toHaveLength(1);
  });
});
