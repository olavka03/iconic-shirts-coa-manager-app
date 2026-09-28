import { beforeEach, describe, expect, it } from "vitest";
import {
  createFakeAdmin,
  type FakeAdmin,
} from "../../../tests/fakes/admin-api.fake";
import { getProductSnapshot } from "./products.gateway";

let fake: FakeAdmin;

beforeEach(() => {
  fake = createFakeAdmin();
});

describe("getProductSnapshot", () => {
  it("returns the title, status and featured image", async () => {
    const product = fake.addProduct({ title: "Signed Shirt", status: "DRAFT" });

    expect(await getProductSnapshot(fake.client, product.id)).toEqual({
      id: product.id,
      title: "Signed Shirt",
      imageUrl: product.imageUrl,
      status: "DRAFT",
    });
    expect(fake.callsTo("CoaProducts")[0].variables).toEqual({
      ids: [product.id],
    });
  });

  it("returns a null image for a product without media", async () => {
    const product = fake.addProduct({ imageUrl: null });

    expect(
      (await getProductSnapshot(fake.client, product.id))?.imageUrl,
    ).toBeNull();
  });

  it("knows the products of the dev-store orders", async () => {
    expect(
      await getProductSnapshot(fake.client, "gid://shopify/Product/70001041"),
    ).toMatchObject({
      title: "Arda Güler Signed Real Madrid 2026/27 Home Football Shirt",
      status: "ACTIVE",
    });
  });

  it("returns null for a deleted product", async () => {
    const product = fake.addProduct();

    fake.removeProduct(product.id);

    expect(await getProductSnapshot(fake.client, product.id)).toBeNull();
  });

  it("returns null for an id that isn't a product", async () => {
    const inner = fake.client.graphql;

    // Shopify answers a node of another type with an empty object for the Product fragment.
    fake.client.graphql = (async () =>
      new Response(
        JSON.stringify({ data: { nodes: [{}] } }),
      )) as unknown as typeof inner;

    expect(
      await getProductSnapshot(fake.client, "gid://shopify/Collection/1"),
    ).toBeNull();
  });
});
