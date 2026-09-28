import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GraphqlQueryError } from "@shopify/shopify-api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isAdminApiError,
  setSleepForTests,
} from "~/.server/gateways/admin-graphql.gateway";
import { getFileStatuses } from "~/.server/gateways/files.gateway";
import {
  createDefinition,
  upsertEntry,
} from "~/.server/gateways/metaobjects.gateway";
import { listOrders } from "~/.server/gateways/orders.gateway";
import { getProductSnapshot } from "~/.server/gateways/products.gateway";
import fixture from "../fixtures/legacy-certificates.fixture.json";
import {
  fetchLegacyRecords,
  readLegacyFile,
} from "../../scripts/legacy-import/legacy-source.gateway";
import { createFakeAdmin, type FakeAdmin } from "./admin-api.fake";
import { ORDER_IDS } from "./orders.fake";

let fake: FakeAdmin;

beforeEach(() => {
  fake = createFakeAdmin();
  setSleepForTests(async () => {});
});

afterEach(() => setSleepForTests(null));

async function define() {
  await createDefinition(fake.client, {
    type: "coa_certificate",
    name: "Certificate",
    description: "",
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
  });
}

// Calls the fake the way the React Router client is called, with any document naming a Coa operation.
async function rawOperation<Body>(
  document: string,
  variables: Record<string, unknown> = {},
): Promise<Body> {
  const response: Response = await fake.client.graphql(
    document as never,
    { variables } as never,
  );

  return (await response.json()) as Body;
}

describe("fake Admin API: entries by hand", () => {
  it("creates an entry by hand, and replaces the fields of an existing one", () => {
    const created = fake.createEntryByHand("abcd1", {
      code: "ABCD1",
      item: "A",
    });
    const replaced = fake.createEntryByHand("abcd1", { code: "ABCD1" });

    expect(replaced.id).toBe(created.id);
    expect(fake.entries.get("abcd1")?.fields).toEqual({ code: "ABCD1" });
  });

  it("deletes an entry by hand", () => {
    fake.createEntryByHand("abcd1", { code: "ABCD1" });
    fake.deleteEntryByHand("abcd1");

    expect(fake.entries.size).toBe(0);
  });

  it("deletes the definition with its entries", async () => {
    await define();
    await upsertEntry(fake.client, "abcd1", { code: "ABCD1" });

    fake.deleteDefinition();

    expect(fake.definition).toBeNull();
    expect(fake.entries.size).toBe(0);
    expect(
      await upsertEntry(fake.client, "abcd1", { code: "ABCD1" }),
    ).toMatchObject({
      code: "UNDEFINED_OBJECT_TYPE",
    });
  });

  it("never reuses an entry id", async () => {
    await define();

    const first = fake.createEntryByHand("abcd1", { code: "ABCD1" });

    fake.deleteEntryByHand("abcd1");

    const again = await upsertEntry(fake.client, "abcd1", { code: "ABCD1" });

    expect(again.ok && again.id).not.toBe(first.id);
  });

  it("replaces every value on upsert: keys left out, null and undefined are cleared", async () => {
    await define();
    await upsertEntry(fake.client, "abcd1", { code: "ABCD1", item: "A" });
    await rawOperation("mutation CoaCertificateUpsert { x }", {
      handle: { type: "coa_certificate", handle: "abcd1" },
      values: { code: "ABCD1", item: null, notes: undefined },
    });

    expect(fake.entries.get("abcd1")?.fields).toEqual({ code: "ABCD1" });
    expect(fake.callsTo("CoaCertificateUpsert")[1].variables).toEqual({
      handle: { type: "coa_certificate", handle: "abcd1" },
      values: { code: "ABCD1", item: null },
    });
  });

  it("rejects values that are not an object keyed by field", async () => {
    await define();

    for (const values of [null, [{ key: "code", value: "ABCD1" }], "ABCD1"]) {
      const error = await rawOperation("mutation CoaCertificateUpsert { x }", {
        handle: { type: "coa_certificate", handle: "abcd1" },
        values,
      }).catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(GraphqlQueryError);
    }

    expect(fake.entries.size).toBe(0);
  });

  it("requires the code field", async () => {
    await define();

    expect(
      await upsertEntry(fake.client, "abcd1", { item: "A" }),
    ).toMatchObject({
      code: "OBJECT_FIELD_REQUIRED",
      elementKey: "code",
    });
  });

  it("rejects the definition with an access.admin key", async () => {
    await rawDefinitionCreate({ storefront: "NONE", admin: "MERCHANT_READ" });

    expect(fake.definition).toBeNull();
  });
});

async function rawDefinitionCreate(access: Record<string, string>) {
  const body = await rawOperation<{
    data: { metaobjectDefinitionCreate: { userErrors: { code: string }[] } };
  }>("mutation CoaDefinitionCreate { x }", {
    definition: {
      type: "coa_certificate",
      name: "C",
      access,
      fieldDefinitions: [],
    },
  });

  expect(body.data.metaobjectDefinitionCreate.userErrors[0].code).toBe(
    "ADMIN_ACCESS_INPUT_NOT_ALLOWED",
  );
}

describe("fake Admin API: failures", () => {
  it("applyThenThrow applies the upsert and then throws a TimeoutError", async () => {
    await define();
    fake.failNext("CoaCertificateUpsert", { applyThenThrow: "timeout" });

    const error = await rawOperation("mutation CoaCertificateUpsert { x }", {
      handle: { type: "coa_certificate", handle: "abcd1" },
      values: { code: "ABCD1" },
    }).catch((thrown: unknown) => thrown);

    expect((error as DOMException).name).toBe("TimeoutError");
    expect(fake.entries.get("abcd1")?.fields).toEqual({ code: "ABCD1" });
  });

  it("applyThenThrow network reaches the adapter as a network error after the write", async () => {
    await define();
    fake.failNext("CoaCertificateUpsert", { applyThenThrow: "network" });

    const error = await upsertEntry(fake.client, "abcd1", {
      code: "ABCD1",
    }).catch((thrown: unknown) => thrown);

    expect(isAdminApiError(error) && error.kind).toBe("network");
    expect(fake.entries.has("abcd1")).toBe(true);
  });

  it("a user error failure applies nothing", async () => {
    await define();
    fake.failNext("CoaCertificateUpsert", {
      userError: { code: "INVALID_VALUE" },
    });

    expect(
      await upsertEntry(fake.client, "abcd1", { code: "ABCD1" }),
    ).toMatchObject({
      ok: false,
      code: "INVALID_VALUE",
      message: "INVALID_VALUE",
    });
    expect(fake.entries.size).toBe(0);
  });

  it("consumes failures in order, then answers normally", async () => {
    fake.failNext("CoaShopInfo", { throwResponse: 500 });
    fake.failNext("CoaShopInfo", { throw: "network" });

    const kinds: string[] = [];

    for (let attempt = 0; attempt < 3; attempt++) {
      const kind = await fake.client
        .graphql("query CoaShopInfo { shop { name } }" as never)
        .then(
          () => "ok",
          (error: unknown) =>
            error instanceof Response
              ? `response ${error.status}`
              : (error as Error).constructor.name,
        );

      kinds.push(kind);
    }

    expect(kinds).toEqual(["response 500", "HttpRequestError", "ok"]);
  });

  it("records every call, failed ones included", async () => {
    await define();
    fake.failNext("CoaCertificateUpsert", { throw: "network" });

    await upsertEntry(fake.client, "abcd1", { code: "ABCD1" }).catch(
      () => null,
    );
    await upsertEntry(fake.client, "abcd1", { code: "ABCD1" });

    expect(fake.calls.map((call) => call.operation)).toEqual([
      "CoaDefinitionCreate",
      "CoaCertificateUpsert",
      "CoaCertificateUpsert",
    ]);
    expect(fake.callsTo("CoaCertificateUpsert")[0].variables).toMatchObject({
      handle: { handle: "abcd1" },
    });
  });

  it("refuses a userError failure for a query", async () => {
    fake.failNext("CoaShopInfo", { userError: { code: "X" } });

    await expect(
      fake.client.graphql("query CoaShopInfo { shop { name } }" as never),
    ).rejects.toThrow(/mutations only/);
  });
});

describe("fake Admin API: files, products and orders", () => {
  it("scripts a file through processing, ready, failed and missing", async () => {
    const file = fake.addFile({ kind: "photo", status: "PROCESSING" });
    const status = async () =>
      (await getFileStatuses(fake.client, [file.id]))[0].status;

    expect(await status()).toBe("processing");

    fake.setFile(file.id, { status: "READY" });
    expect(await status()).toBe("ready");

    fake.setFile(file.id, {
      status: "FAILED",
      errorCode: "INVALID_IMAGE_FILE_SIZE",
    });
    expect(await status()).toBe("failed");

    fake.removeFile(file.id);
    expect(await status()).toBe("missing");
  });

  it("forgets a deleted product", async () => {
    const id = "gid://shopify/Product/70001021";

    expect(await getProductSnapshot(fake.client, id)).not.toBeNull();

    fake.removeProduct(id);

    expect(await getProductSnapshot(fake.client, id)).toBeNull();
  });

  it("sees orders edited mid-test", async () => {
    fake.orders[0].lineItems[0].currentQuantity = 0;

    const { orders } = await listOrders(fake.client, { query: "name:141002" });

    expect(orders[0].id).toBe(ORDER_IDS.order141002);
    expect(orders[0].lineItems[0].currentQuantity).toBe(0);
    expect(orders[0].currentSubtotalLineItemsQuantity).toBe(1);
  });

  it("matches name terms by their letters and digits, ignoring status terms", async () => {
    const names = async (query: string) =>
      (await listOrders(fake.client, { query })).orders.map(
        (order) => order.name,
      );

    expect(await names("name:#141003")).toEqual(["#141003"]);
    expect(
      await names(
        "(status:open OR status:closed OR status:cancelled) AND (name:141004 OR name:#141004)",
      ),
    ).toEqual(["#141004"]);
    expect(
      await names("status:open OR status:closed OR status:cancelled"),
    ).toHaveLength(4);
    expect(await names("name:141002ORX OR name:#141002ORX")).toEqual([]);
  });

  it("leaves orders outside the 60-day window out of search", async () => {
    fake.orders[3].outsideWindow = true;

    const { orders } = await listOrders(fake.client, { query: null });

    expect(orders.map((order) => order.name)).toEqual([
      "#141004",
      "#141003",
      "#141002",
    ]);
  });

  it("fails loudly on a search term it doesn't understand", async () => {
    const error = await listOrders(fake.client, { query: "email:x" }).catch(
      (thrown: unknown) => thrown,
    );

    expect((error as Error).message).toMatch(
      /only understands name: and status:/,
    );
  });
});

describe("fake Admin API: the legacy metafield (scripts/legacy-import/legacy-source.gateway.ts)", () => {
  it("serves the legacy records from the shop", async () => {
    fake = createFakeAdmin({ legacy: fixture });

    const source = await fetchLegacyRecords(fake.client);

    expect(source).toMatchObject({
      kind: "shop",
      updatedAt: "2026-09-20T09:00:00Z",
    });
    expect(source.records).toHaveLength(375);
    expect(source.bytes).toBe(Buffer.byteLength(JSON.stringify(fixture)));
  });

  it("throws when the shop has no legacy metafield", async () => {
    await expect(fetchLegacyRecords(fake.client)).rejects.toThrow(
      "The shop has no custom.certification_verification metafield.",
    );
  });

  it("throws when the metafield doesn't hold an array", async () => {
    fake.legacyMetafield = {
      jsonValue: { a: 1 },
      updatedAt: "2026-09-20T09:00:00Z",
    };

    await expect(fetchLegacyRecords(fake.client)).rejects.toThrow(/JSON array/);
  });

  it("reads the records from a file", async () => {
    const source = await readLegacyFile(
      "tests/fixtures/legacy-certificates.fixture.json",
    );

    expect(source).toMatchObject({ kind: "file", updatedAt: null });
    expect(source.records).toHaveLength(375);
  });

  it("refuses a file that doesn't hold an array", async () => {
    const directory = await mkdtemp(join(tmpdir(), "coa-legacy-"));
    const path = join(directory, "object.json");

    await writeFile(path, '{"a":1}');

    await expect(readLegacyFile(path)).rejects.toThrow(/JSON array/);
  });
});
