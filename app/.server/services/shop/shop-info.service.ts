import type { AdminContext } from "~/.server/gateways/admin-graphql.gateway";
import { fetchShopInfo } from "~/.server/gateways/shop.gateway";
import { log } from "~/.server/logging/logger.service";
import {
  ADMIN_READ_BUDGET_MS,
  failureKind,
  rethrowAuth,
} from "~/.server/services/shared/admin-read.utils";

export type ShopInfo = {
  name: string;
  timeZone: string;
  orderNumberFormatPrefix: string;
  orderNumberFormatSuffix: string;
};

type CacheEntry = { read: Promise<ShopInfo | null>; expiresAt: number };

const CACHE_TTL_MS = 10 * 60 * 1000;
const shopInfoCache = new Map<string, CacheEntry>();

export function getShopInfo(
  context: AdminContext,
  options: { signal?: AbortSignal } = {},
): Promise<ShopInfo | null> {
  return nullOnAbort(sharedRead(context), options.signal);
}

function sharedRead(context: AdminContext): Promise<ShopInfo | null> {
  const cached = shopInfoCache.get(context.shop);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.read;
  }

  const read = readShopInfo(context);

  rememberRead(context.shop, read);

  return read;
}

function rememberRead(shop: string, read: Promise<ShopInfo | null>): void {
  const forget = () => {
    if (shopInfoCache.get(shop)?.read === read) {
      shopInfoCache.delete(shop);
    }
  };

  shopInfoCache.set(shop, { read, expiresAt: Date.now() + CACHE_TTL_MS });
  read.then((shopInfo) => {
    if (shopInfo === null) {
      forget();
    }
  }, forget);
}

// Shared by every caller, so it runs on its own budget: one caller's abort mustn't fail the rest.
async function readShopInfo(context: AdminContext): Promise<ShopInfo | null> {
  try {
    const shopNode = await fetchShopInfo(context.admin, {
      signal: AbortSignal.timeout(ADMIN_READ_BUDGET_MS),
    });

    return {
      name: shopNode.name,
      timeZone: shopNode.ianaTimezone,
      orderNumberFormatPrefix: shopNode.orderNumberFormatPrefix,
      orderNumberFormatSuffix: shopNode.orderNumberFormatSuffix,
    };
  } catch (error) {
    rethrowAuth(error);
    log.warn("shop_info.unavailable", {
      shop: context.shop,
      kind: failureKind(error),
    });

    return null;
  }
}

function nullOnAbort<Value>(
  promise: Promise<Value>,
  signal?: AbortSignal,
): Promise<Value | null> {
  if (!signal) {
    return promise;
  }

  if (signal.aborted) {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => resolve(null);

    signal.addEventListener("abort", onAbort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", onAbort));
  });
}

export function shopTimeZone(shopInfo: ShopInfo | null): string {
  return shopInfo?.timeZone ?? "UTC";
}

export function clearShopInfoCache(): void {
  shopInfoCache.clear();
}
