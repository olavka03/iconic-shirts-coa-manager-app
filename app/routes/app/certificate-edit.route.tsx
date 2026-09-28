import type { AdminContext } from "~/.server/gateways/admin-graphql.gateway";
import { StreamedEditForm } from "~/features/certificates/components/streamed-pages.component";
import { RouteErrorBoundary } from "~/features/certificates/components/route-error-boundary.component";
import { codePrefixFor } from "~/features/codes/utils/code.utils";
import { log, timed } from "~/.server/logging/logger.service";
import { getCertificateDetail } from "~/.server/services/certificates/certificate-read.service";
import { getCodeDictionary } from "~/.server/services/codes/codes.service";
import {
  parseIdParam,
  throwNotFound,
} from "~/.server/services/shared/json-response.utils";
import { embeddedHeaders } from "~/.server/shopify/embedded-headers.utils";
import { adminContextOf } from "~/.server/shopify/admin-context.service";
import type { Route } from "./+types/certificate-edit.route";

// Null is a certificate that doesn't exist (or belongs to another shop): the page shows Not found.
async function loadEditForm(shopContext: AdminContext, id: string) {
  const {
    value: [certificate, codeDictionary],
    elapsedMs,
  } = await timed(() =>
    Promise.all([
      getCertificateDetail(shopContext, id),
      getCodeDictionary(shopContext),
    ]),
  );

  log.info("page.certificate", { shop: shopContext.shop, ms: elapsedMs });

  if (certificate === null) {
    return null;
  }

  const codePrefix = codePrefixFor(
    certificate.values.code,
    certificate.values.order?.name,
    codeDictionary.prefix,
  );

  return { kind: "edit" as const, certificate, codeDictionary, codePrefix };
}

// The form is streamed, so the skeleton is in the first bytes of the page.
export const loader = async ({ request, params }: Route.LoaderArgs) => {
  const shopContext = await adminContextOf(request);
  const id = parseIdParam(params.id);

  if (id === null) {
    throwNotFound();
  }

  return { id, form: loadEditForm(shopContext, id) };
};

export default function CertificateRoute({ loaderData }: Route.ComponentProps) {
  return <StreamedEditForm key={loaderData.id} form={loaderData.form} />;
}

export function ErrorBoundary() {
  return <RouteErrorBoundary scope="certificate" />;
}

export const headers = embeddedHeaders;
