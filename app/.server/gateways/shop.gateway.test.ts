import { describe, expect, it } from "vitest";
import { createFakeAdmin } from "../../../tests/fakes/admin-api.fake";
import { fetchShopInfo } from "./shop.gateway";

describe("fetchShopInfo", () => {
  it("returns the shop's name, time zone and order number format", async () => {
    const fake = createFakeAdmin();

    expect(await fetchShopInfo(fake.client)).toEqual({
      name: "Iconic Shirts Test",
      ianaTimezone: "Europe/London",
      orderNumberFormatPrefix: "#",
      orderNumberFormatSuffix: "",
    });
  });

  it("uses the format Shopify returns", async () => {
    const fake = createFakeAdmin({
      shop: { orderNumberFormatPrefix: "EN", orderNumberFormatSuffix: "-UK" },
    });

    expect(await fetchShopInfo(fake.client)).toMatchObject({
      orderNumberFormatPrefix: "EN",
      orderNumberFormatSuffix: "-UK",
    });
  });

  it("reads a null prefix or suffix as empty", async () => {
    const fake = createFakeAdmin();

    Object.assign(fake.shop, {
      orderNumberFormatPrefix: null,
      orderNumberFormatSuffix: null,
    });

    expect(await fetchShopInfo(fake.client)).toMatchObject({
      orderNumberFormatPrefix: "",
      orderNumberFormatSuffix: "",
    });
  });
});
