import { z } from "zod";
import type { AdminContext } from "~/.server/gateways/admin-graphql.gateway";
import type {
  DeleteOneResponse,
  UpdateResponse,
} from "~/features/certificates/types/certificates.types";
import { deleteCertificates } from "~/.server/services/certificates/certificate-delete.service";
import { getCertificateDetail } from "~/.server/services/certificates/certificate-read.service";
import { updateCertificate } from "~/.server/services/certificates/certificate-save.service";
import { completeCertificateMedia } from "~/.server/services/certificates/media-completion.service";
import {
  invalid,
  jsonResponse,
  notFoundJson,
  parseIdParam,
  readJsonBody,
  saveFailureResponse,
  withJsonErrors,
} from "~/.server/services/shared/json-response.utils";
import { adminContextOf } from "~/.server/shopify/admin-context.service";
import type { Route } from "./+types/certificate-by-id.route";

const CertificateBody = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("update"),
    values: z.record(z.string(), z.unknown()),
  }),
  z.object({ intent: z.literal("delete") }),
  z.object({ intent: z.literal("complete-media") }),
]);

// null right after a write means the certificate was deleted in between.
async function certificateResponse(
  shopContext: AdminContext,
  id: string,
): Promise<Response> {
  const certificate = await getCertificateDetail(shopContext, id);

  if (!certificate) {
    return notFoundJson();
  }

  return jsonResponse({ ok: true, certificate } satisfies UpdateResponse);
}

async function update(
  shopContext: AdminContext,
  id: string,
  values: Record<string, unknown>,
): Promise<Response> {
  const result = await updateCertificate(shopContext, id, values);

  return result.ok
    ? certificateResponse(shopContext, id)
    : saveFailureResponse(result);
}

async function completeMedia(
  shopContext: AdminContext,
  id: string,
): Promise<Response> {
  const outcome = await completeCertificateMedia(shopContext, id);

  return outcome === "not_found"
    ? notFoundJson()
    : certificateResponse(shopContext, id);
}

async function remove(
  shopContext: AdminContext,
  id: string,
): Promise<Response> {
  await deleteCertificates(shopContext, [id]);

  return jsonResponse({ ok: true } satisfies DeleteOneResponse);
}

export const action = ({ request, params }: Route.ActionArgs) =>
  withJsonErrors("api.certificate.failed", async () => {
    const shopContext = await adminContextOf(request);
    const id = parseIdParam(params.id);

    if (id === null) {
      return notFoundJson();
    }

    const body = CertificateBody.safeParse(await readJsonBody(request));

    if (!body.success) {
      return invalid();
    }

    switch (body.data.intent) {
      case "update":
        return update(shopContext, id, body.data.values);
      case "delete":
        return remove(shopContext, id);
      case "complete-media":
        return completeMedia(shopContext, id);
    }
  });
