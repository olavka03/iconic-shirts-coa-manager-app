import type { AdminContext } from "~/.server/gateways/admin-graphql.gateway";
import { StreamedNewForm } from "~/features/certificates/components/streamed-pages.component";
import { EMPTY_VALUES } from "~/features/certificates/constants/certificate-form.constants";
import { RouteErrorBoundary } from "~/features/certificates/components/route-error-boundary.component";
import { codePrefixFor } from "~/features/codes/utils/code.utils";
import type { TeamDictionary } from "~/features/codes/types/code-generator.types";
import { withSeriesHint } from "~/features/codes/utils/code-suggestion.utils";
import { getDuplicateDraft } from "~/.server/services/certificates/certificate-read.service";
import { getCodeDictionary } from "~/.server/services/codes/codes.service";
import { parseIdParam } from "~/.server/services/shared/json-response.utils";
import { embeddedHeaders } from "~/.server/shopify/embedded-headers.utils";
import { adminContextOf } from "~/.server/shopify/admin-context.service";
import type { Route } from "./+types/certificate-new.route";

function blankForm(codeDictionary: TeamDictionary, duplicateMissing: boolean) {
  return {
    kind: "create" as const,
    initial: EMPTY_VALUES,
    codeDictionary,
    codePrefix: codeDictionary.prefix,
    duplicateMissing,
  };
}

async function loadNewForm(shopContext: AdminContext, rawId: string | null) {
  const id = rawId === null ? null : parseIdParam(rawId);
  const [dictionary, draft] = await Promise.all([
    getCodeDictionary(shopContext),
    id === null ? null : getDuplicateDraft(shopContext, id),
  ]);

  if (rawId === null) {
    return blankForm(dictionary, false);
  }

  if (id === null || draft === null) {
    return blankForm(dictionary, true);
  }

  const codeDictionary = withSeriesHint(dictionary, draft.source);

  return {
    kind: "duplicate" as const,
    initial: draft.values,
    codeDictionary,
    codePrefix: codePrefixFor(
      draft.source.code,
      draft.source.orderName,
      codeDictionary.prefix,
    ),
    duplicateOf: { id, code: draft.sourceCode },
  };
}

// The form is streamed, so the skeleton is in the first bytes of the page.
export const loader = async ({ request }: Route.LoaderArgs) => {
  const shopContext = await adminContextOf(request);
  const rawId = new URL(request.url).searchParams.get("duplicate");

  return { rawId, form: loadNewForm(shopContext, rawId) };
};

export default function NewCertificateRoute({
  loaderData,
}: Route.ComponentProps) {
  return (
    <StreamedNewForm
      key={loaderData.rawId ?? "create"}
      form={loaderData.form}
    />
  );
}

export function ErrorBoundary() {
  return <RouteErrorBoundary scope="certificate" />;
}

export const headers = embeddedHeaders;
