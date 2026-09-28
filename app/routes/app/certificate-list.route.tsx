import type { IndexData } from "~/features/certificates/components/list/certificates-index-page.component";
import { StreamedIndexPage } from "~/features/certificates/components/streamed-pages.component";
import { RouteErrorBoundary } from "~/features/certificates/components/route-error-boundary.component";
import {
  parseListParams,
  type ListParams,
} from "~/features/certificates/utils/list-params.utils";
import type { AdminContext } from "~/.server/gateways/admin-graphql.gateway";
import { log, timed } from "~/.server/logging/logger.service";
import { listCertificates } from "~/.server/repositories/certificate-list.repository";
import { completePendingInBackground } from "~/.server/services/certificates/media-completion.service";
import { toListItem } from "~/.server/services/certificates/certificate-views.utils";
import { embeddedHeaders } from "~/.server/shopify/embedded-headers.utils";
import { adminContextOf } from "~/.server/shopify/admin-context.service";
import type { Route } from "./+types/certificate-list.route";

async function loadIndex(
  shopContext: AdminContext,
  params: ListParams,
): Promise<IndexData> {
  const { value: list, elapsedMs } = await timed(() =>
    listCertificates(shopContext.shop, params),
  );

  log.info("page.index", {
    shop: shopContext.shop,
    dbMs: elapsedMs,
    total: list.total,
  });
  completePendingInBackground(shopContext);

  return {
    params,
    rows: list.rows.map(toListItem),
    total: list.total,
    page: list.page,
    pageCount: list.pageCount,
    storeIsEmpty: list.storeIsEmpty,
  };
}

// The list is streamed, so the skeleton is in the first bytes of the page.
export const loader = async ({ request }: Route.LoaderArgs) => {
  const shopContext = await adminContextOf(request);
  const params = parseListParams(new URL(request.url).searchParams);

  return { params, list: loadIndex(shopContext, params) };
};

export default function CertificatesIndexRoute({
  loaderData,
}: Route.ComponentProps) {
  return (
    <StreamedIndexPage view={loaderData.params.view} list={loaderData.list} />
  );
}

export function ErrorBoundary() {
  return <RouteErrorBoundary scope="index" />;
}

export const headers = embeddedHeaders;
