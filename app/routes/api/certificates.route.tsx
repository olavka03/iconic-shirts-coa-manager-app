import { z } from "zod";
import type {
  CreateResponse,
  DeleteManyResponse,
} from "~/features/certificates/types/certificates.types";
import { MAX_PER_PAGE } from "~/features/certificates/utils/list-params.utils";
import { deleteCertificates } from "~/.server/services/certificates/certificate-delete.service";
import { createCertificate } from "~/.server/services/certificates/certificate-save.service";
import {
  invalid,
  isUuid,
  jsonResponse,
  readJsonBody,
  saveFailureResponse,
  withJsonErrors,
} from "~/.server/services/shared/json-response.utils";
import { adminContextOf } from "~/.server/shopify/admin-context.service";
import type { Route } from "./+types/certificates.route";

const CertificatesBody = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("create"),
    values: z.record(z.string(), z.unknown()),
  }),
  z.object({
    intent: z.literal("delete"),
    ids: z
      .array(
        z
          .string()
          .refine(isUuid)
          .transform((id) => id.toLowerCase()),
      )
      .min(1)
      .max(MAX_PER_PAGE),
  }),
]);

export const action = ({ request }: Route.ActionArgs) =>
  withJsonErrors("api.certificates.failed", async () => {
    const shopContext = await adminContextOf(request);
    const body = CertificatesBody.safeParse(await readJsonBody(request));

    if (!body.success) {
      return invalid();
    }

    if (body.data.intent === "delete") {
      const { deleted } = await deleteCertificates(shopContext, body.data.ids);

      return jsonResponse({ ok: true, deleted } satisfies DeleteManyResponse);
    }

    const result = await createCertificate(shopContext, body.data.values);

    if (!result.ok) {
      return saveFailureResponse(result);
    }

    return jsonResponse({
      ok: true,
      id: result.id,
      code: result.code,
    } satisfies CreateResponse);
  });
