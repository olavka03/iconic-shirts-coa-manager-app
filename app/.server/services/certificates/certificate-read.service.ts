import type { AdminContext } from "~/.server/gateways/admin-graphql.gateway";
import {
  getProductSnapshot,
  type ProductSnapshot,
} from "~/.server/gateways/products.gateway";
import type { CodeHistoryItem } from "~/features/codes/types/code-generator.types";
import type {
  CertificateDetail,
  CertificateFormValues,
} from "~/features/certificates/types/certificates.types";
import { log, timed } from "~/.server/logging/logger.service";
import { getCertificate } from "~/.server/repositories/certificate.repository";
import type { CertificateRecord } from "~/.server/repositories/certificate.types";
import { certificatesForOrder } from "~/.server/repositories/order-links.repository";
import { getOrderCard } from "~/.server/services/orders/orders.service";
import {
  ADMIN_READ_BUDGET_MS,
  failureKind,
  rethrowAuth,
} from "~/.server/services/shared/admin-read.utils";
import {
  getShopInfo,
  shopTimeZone,
} from "~/.server/services/shop/shop-info.service";
import { toOrderCertificateReference } from "~/.server/services/orders/order-views.utils";
import {
  productValue,
  toCertificateDetail,
  toFormValues,
} from "./certificate-views.utils";

type LiveProduct = ProductSnapshot | null | "error";

async function readProduct(
  context: AdminContext,
  productId: string | null,
  signal: AbortSignal,
): Promise<LiveProduct> {
  if (productId === null) {
    return null;
  }

  try {
    return await getProductSnapshot(context.admin, productId, { signal });
  } catch (error) {
    rethrowAuth(error);
    log.warn("certificate.product_unavailable", {
      shop: context.shop,
      kind: failureKind(error),
    });

    return "error";
  }
}

function readOrderCard(
  context: AdminContext,
  certificate: CertificateRecord,
  signal: AbortSignal,
) {
  const { orderId, lineItemId } = certificate;

  return orderId !== null && lineItemId !== null
    ? getOrderCard(context, { orderId, lineItemId }, { signal })
    : Promise.resolve(null);
}

async function readShopifyForDetail(
  context: AdminContext,
  certificate: CertificateRecord,
) {
  const signal = AbortSignal.timeout(ADMIN_READ_BUDGET_MS);
  const [product, orderCard, shopInfo] = await Promise.all([
    readProduct(context, certificate.productId, signal),
    readOrderCard(context, certificate, signal),
    getShopInfo(context, { signal }),
  ]);

  return { product, orderCard, shopInfo };
}

export async function getCertificateDetail(
  context: AdminContext,
  id: string,
): Promise<CertificateDetail | null> {
  const record = await timed(() => getCertificate(context.shop, id));
  const certificate = record.value;

  if (!certificate) {
    return null;
  }

  const [orderRows, shopify] = await Promise.all([
    timed(() =>
      certificatesForOrder(
        context.shop,
        { orderId: certificate.orderId, orderName: certificate.orderName },
        certificate.id,
      ),
    ),
    timed(() => readShopifyForDetail(context, certificate)),
  ]);

  log.info("certificate.detail_timing", {
    shop: context.shop,
    dbMs: record.elapsedMs + orderRows.elapsedMs,
    adminMs: shopify.elapsedMs,
  });

  return toCertificateDetail(certificate, {
    product: productValue(certificate, shopify.value.product),
    orderCard: shopify.value.orderCard,
    orderCertificates: orderRows.value.map(toOrderCertificateReference),
    timeZone: shopTimeZone(shopify.value.shopInfo),
  });
}

export async function getDuplicateDraft(
  context: AdminContext,
  sourceId: string,
): Promise<{
  values: CertificateFormValues;
  source: CodeHistoryItem;
  sourceCode: string;
} | null> {
  const source = await getCertificate(context.shop, sourceId);

  if (!source) {
    return null;
  }

  const liveProduct = await readProduct(
    context,
    source.productId,
    AbortSignal.timeout(ADMIN_READ_BUDGET_MS),
  );

  return {
    values: {
      ...toFormValues(source, productValue(source, liveProduct)),
      code: "",
      order: null,
      lineItem: null,
    },
    source: {
      code: source.code,
      item: source.item,
      signerNames: source.signers.map((signer) => signer.name),
      orderName: source.orderName,
      productId: source.productId,
    },
    sourceCode: source.code,
  };
}
