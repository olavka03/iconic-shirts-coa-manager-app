import {
  adminGraphql,
  type AdminClient,
  type AdminGraphqlOptions,
} from "./admin-graphql.gateway";

export type ShopInfoNode = {
  name: string;
  ianaTimezone: string;
  orderNumberFormatPrefix: string;
  orderNumberFormatSuffix: string;
};

const SHOP_INFO = `#graphql
  query CoaShopInfo {
    shop {
      name
      ianaTimezone
      orderNumberFormatPrefix
      orderNumberFormatSuffix
    }
  }
` as const;

export async function fetchShopInfo(
  admin: AdminClient,
  options?: AdminGraphqlOptions,
): Promise<ShopInfoNode> {
  const data = await adminGraphql(admin, SHOP_INFO, undefined, options);
  const shop = data.shop;

  return {
    name: shop.name,
    ianaTimezone: shop.ianaTimezone,
    orderNumberFormatPrefix: shop.orderNumberFormatPrefix ?? "",
    orderNumberFormatSuffix: shop.orderNumberFormatSuffix ?? "",
  };
}
