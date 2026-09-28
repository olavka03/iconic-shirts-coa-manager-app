import type { z } from "zod";
import {
  toFieldErrors,
  type CertificateInput,
  type ImportCertificateInputSchema,
} from "~/features/certificates/schemas/certificate.schema";
import type { CertificateWrite } from "~/.server/repositories/certificate.types";
import type {
  PlanContext,
  Issue,
  IssueCode,
  IssueSeverity,
  ParsedLegacy,
} from "./legacy-import.types";
import { backfillOrderName } from "./legacy-order-names.utils";

export const makeIssue = (
  severity: IssueSeverity,
  code: IssueCode,
  message: string,
): Issue => ({ severity, code, message });

export function importInput(
  parsed: ParsedLegacy,
): z.input<typeof ImportCertificateInputSchema> {
  return {
    code: parsed.code,
    order: null,
    lineItem: null,
    item: parsed.item,
    productId: null,
    productHint: null,
    photo: parsed.photoUrl ? { source: "url", url: parsed.photoUrl } : null,
    video: parsed.videoUrl ? { source: "url", url: parsed.videoUrl } : null,
    notes: parsed.notes,
    signers: parsed.signers,
  };
}

export function schemaIssue(error: z.ZodError): Issue {
  const [field, message] = Object.entries(toFieldErrors(error))[0];

  return makeIssue("error", "PARSE_ERROR", `${field}: ${message}`);
}

export function orderNameFor(
  code: string,
  context: PlanContext,
): { orderName: string | null; issues: Issue[] } {
  if (!context.prefixSupported) {
    return { orderName: null, issues: [] };
  }

  const { orderModel, formatPrefix, formatSuffix } = context.input;
  const result = backfillOrderName(
    code,
    orderModel,
    formatPrefix,
    formatSuffix,
  );

  return result.ok
    ? { orderName: result.orderName, issues: [] }
    : {
        orderName: null,
        issues: [
          makeIssue(
            "info",
            "ORDER_NOT_BACKFILLED",
            `No order name (${result.reason}).`,
          ),
        ],
      };
}

// Built from the schema's output (trimmed notes, normalised signers), so saving an imported
// certificate without edits changes nothing in the database (spec §12.8).
export function toWrite(
  checked: CertificateInput,
  orderName: string | null,
): CertificateWrite {
  return {
    code: checked.code,
    item: checked.item,
    notes: checked.notes,
    orderId: null,
    orderName,
    lineItemId: null,
    lineItemTitle: null,
    photoUrl: checked.photo?.source === "url" ? checked.photo.url : null,
    photoFileId: null,
    videoUrl: checked.video?.source === "url" ? checked.video.url : null,
    videoFileId: null,
    videoPreviewUrl: null,
    productId: null,
    productTitle: null,
    productImageUrl: null,
    signers: checked.signers,
  };
}
