import {
  isAdminApiError,
  type AdminContext,
} from "~/.server/gateways/admin-graphql.gateway";
import { getProductSnapshot } from "~/.server/gateways/products.gateway";
import prisma from "~/.server/db/prisma.singleton";
import {
  CertificateInputSchema,
  codeConflictMessage,
  CreateCertificateInputSchema,
  toFieldErrors,
  type CertificateInput,
} from "~/features/certificates/schemas/certificate.schema";
import { codeToHandle } from "~/features/codes/utils/code.utils";
import type { FieldErrors } from "~/shared/types/api.types";
import { signerSummary } from "~/features/signers/utils/signer-text.utils";
import { errorName, log } from "~/.server/logging/logger.service";
import { findCodeOwner } from "~/.server/repositories/certificate-codes.repository";
import {
  getCertificate,
  insertCertificate,
  updateCertificateRow,
} from "~/.server/repositories/certificate.repository";
import type {
  CertificateRecord,
  CertificateWrite,
} from "~/.server/repositories/certificate.types";
import {
  countForLineItem,
  lockLineItem,
} from "~/.server/repositories/order-links.repository";
import {
  isRecordNotFound,
  isUniqueViolation,
  prismaErrorCode,
} from "~/.server/db/prisma-errors.utils";
import { enqueueUpsert } from "~/.server/repositories/sync-queue.repository";
import { dropCodeDictionary } from "~/.server/services/codes/codes.service";
import { resolveMediaForSave } from "~/.server/services/media/media.service";
import { pushInBackground } from "~/.server/services/mirror/mirror-background.service";
import {
  resolveOrderLink,
  type StoredLink,
} from "~/.server/services/orders/orders.service";
import {
  ADMIN_READ_BUDGET_MS,
  rethrowAuth,
} from "~/.server/services/shared/admin-read.utils";

export type SaveResult =
  | { ok: true; id: string; code: string }
  | { ok: false; kind: "validation"; fieldErrors: FieldErrors }
  | { ok: false; kind: "not_found" }
  | { ok: false; kind: "unavailable" };

type ProductColumns = Pick<
  CertificateWrite,
  "productId" | "productTitle" | "productImageUrl"
>;
type ResolvedWrite =
  | { write: CertificateWrite; capacity: number | null }
  | { fieldErrors: FieldErrors };

class CapacityError extends Error {}

const CAPACITY =
  "All certificates for this item are already created. Select another item.";
const CODE_TAKEN = "This code is already used.";
const NO_PRODUCT: ProductColumns = {
  productId: null,
  productTitle: null,
  productImageUrl: null,
};

const validation = (fieldErrors: FieldErrors): SaveResult => ({
  ok: false,
  kind: "validation",
  fieldErrors,
});

const storedLink = (certificate: CertificateRecord): StoredLink => ({
  orderId: certificate.orderId,
  orderName: certificate.orderName,
  lineItemId: certificate.lineItemId,
  lineItemTitle: certificate.lineItemTitle,
});

export async function createCertificate(
  context: AdminContext,
  raw: unknown,
): Promise<SaveResult> {
  const parsed = CreateCertificateInputSchema.safeParse(raw);

  if (!parsed.success) {
    return validation(toFieldErrors(parsed.error));
  }

  return save(context, null, parsed.data);
}

export async function updateCertificate(
  context: AdminContext,
  id: string,
  raw: unknown,
): Promise<SaveResult> {
  const parsed = CertificateInputSchema.safeParse(raw);

  if (!parsed.success) {
    return validation(toFieldErrors(parsed.error));
  }

  const previous = await getCertificate(context.shop, id);

  if (!previous) {
    return { ok: false, kind: "not_found" };
  }

  return save(context, previous, parsed.data);
}

// A Shopify read failure never blocks the save of a Postgres-owned record; only an expired
// session does, so App Bridge can retry before anything is written.
async function resolveProduct(
  context: AdminContext,
  productId: string | null,
  hint: CertificateInput["productHint"],
  previous: CertificateRecord | null,
): Promise<ProductColumns> {
  if (productId === null) {
    return NO_PRODUCT;
  }

  try {
    const snapshot = await getProductSnapshot(context.admin, productId, {
      signal: AbortSignal.timeout(ADMIN_READ_BUDGET_MS),
    });

    return snapshot
      ? {
          productId: snapshot.id,
          productTitle: snapshot.title,
          productImageUrl: snapshot.imageUrl,
        }
      : NO_PRODUCT;
  } catch (error) {
    rethrowAuth(error);

    if (!isAdminApiError(error)) {
      throw error;
    }

    log.warn("certificate.product_unverified", {
      shop: context.shop,
      kind: error.kind,
    });

    if (previous?.productId === productId) {
      return {
        productId,
        productTitle: previous.productTitle,
        productImageUrl: previous.productImageUrl,
      };
    }

    return {
      productId,
      productTitle: hint?.title ?? null,
      productImageUrl: hint?.imageUrl ?? null,
    };
  }
}

async function resolveWrite(
  context: AdminContext,
  previous: CertificateRecord | null,
  input: CertificateInput,
): Promise<ResolvedWrite> {
  const [media, product, link] = await Promise.all([
    resolveMediaForSave(context.admin, input.photo, input.video, previous),
    resolveProduct(context, input.productId, input.productHint, previous),
    resolveOrderLink(
      context,
      { order: input.order, lineItem: input.lineItem },
      previous ? storedLink(previous) : null,
    ),
  ]);

  if (!link.ok) {
    return { fieldErrors: { ...media.fieldErrors, ...link.fieldErrors } };
  }

  if (Object.keys(media.fieldErrors).length > 0) {
    return { fieldErrors: media.fieldErrors };
  }

  return {
    write: {
      code: input.code,
      item: input.item,
      notes: input.notes,
      ...link.link,
      ...media.columns,
      ...product,
      signers: input.signers.map((signer) => ({
        name: signer.name,
        date: signer.date,
        location: signer.location,
      })),
    },
    capacity: link.capacity,
  };
}

// The advisory lock serialises saves for one line item, so two saves for its last free unit
// can't both see room for themselves.
function writeCertificate(
  shop: string,
  previous: CertificateRecord | null,
  write: CertificateWrite,
  capacity: number | null,
) {
  return prisma.$transaction(async (transaction) => {
    if (capacity !== null && write.lineItemId !== null) {
      await lockLineItem(transaction, shop, write.lineItemId);
      const linked = await countForLineItem(
        transaction,
        shop,
        write.lineItemId,
        previous?.id,
      );

      if (linked >= capacity) {
        throw new CapacityError();
      }
    }

    const saved =
      previous === null
        ? {
            ...(await insertCertificate(transaction, shop, write)),
            previousCode: null,
          }
        : await updateCertificateRow(transaction, shop, previous.id, write);

    await enqueueUpsert(transaction, {
      shop,
      certificateId: saved.id,
      version: saved.version,
      handle: codeToHandle(saved.code),
      previousHandle:
        saved.previousCode === null ? null : codeToHandle(saved.previousCode),
    });

    return saved;
  });
}

async function codeTakenMessage(
  shop: string,
  code: string,
  excludeId?: string,
): Promise<string> {
  const owner = await findCodeOwner(shop, code, excludeId);

  return owner
    ? codeConflictMessage({
        signers: signerSummary(owner.signerNames),
        item: owner.item,
      })
    : CODE_TAKEN;
}

async function saveFailure(
  context: AdminContext,
  write: CertificateWrite,
  previous: CertificateRecord | null,
  error: unknown,
): Promise<SaveResult> {
  if (error instanceof CapacityError) {
    return validation({ lineItem: CAPACITY });
  }

  if (isUniqueViolation(error)) {
    return validation({
      code: await codeTakenMessage(context.shop, write.code, previous?.id),
    });
  }

  if (isRecordNotFound(error)) {
    return { ok: false, kind: "not_found" };
  }

  log.error("certificate.save_failed", {
    shop: context.shop,
    error: prismaErrorCode(error) ?? errorName(error),
  });

  return { ok: false, kind: "unavailable" };
}

async function save(
  context: AdminContext,
  previous: CertificateRecord | null,
  input: CertificateInput,
): Promise<SaveResult> {
  const resolved = await resolveWrite(context, previous, input);

  if ("fieldErrors" in resolved) {
    return validation(resolved.fieldErrors);
  }

  try {
    const saved = await writeCertificate(
      context.shop,
      previous,
      resolved.write,
      resolved.capacity,
    );

    pushInBackground(context, saved.id);
    dropCodeDictionary(context.shop);

    return { ok: true, id: saved.id, code: saved.code };
  } catch (error) {
    return saveFailure(context, resolved.write, previous, error);
  }
}
