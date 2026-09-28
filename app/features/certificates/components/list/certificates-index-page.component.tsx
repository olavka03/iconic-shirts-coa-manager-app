import { useCallback, useEffect, useMemo } from "react";
import {
  useLocation,
  useNavigation,
  useRevalidator,
  useSearchParams,
  type Location,
  type SetURLSearchParams,
} from "react-router";
import { useAdminLoading } from "~/shared/hooks/use-admin-loading.hook";
import { requestJson } from "~/shared/utils/json-request.utils";
import { writeLastIndexSearch } from "~/features/certificates/hooks/use-last-index-search.hook";
import type {
  CertificateListItem,
  DeleteManyResponse,
} from "~/features/certificates/types/certificates.types";
import {
  parseListParams,
  toSearchParams,
  type ListParams,
  type ListPatchHandler,
} from "~/features/certificates/utils/list-params.utils";
import { DeleteCertificatesModal } from "~/features/certificates/components/delete-certificates-modal.component";
import { CertificatesGrid } from "./certificates-grid.component";
import { CertificatesTable } from "./certificates-table.component";
import { FirstCertificateEmptyState } from "./index-empty-states.component";
import { nextParams } from "~/features/certificates/utils/index-state.utils";
import { pluralize } from "~/shared/utils/format.utils";
import { usePageSelection } from "~/features/certificates/hooks/use-page-selection.hook";

export type IndexData = {
  params: ListParams;
  rows: CertificateListItem[];
  total: number;
  page: number;
  pageCount: number;
  storeIsEmpty: boolean;
};

// The loader clamps a page past the end; the URL follows once so reloads and Back land on a real page.
function useClampedPageUrl(
  data: IndexData,
  urlPage: number,
  setSearchParams: SetURLSearchParams,
) {
  const { params, page } = data;

  useEffect(() => {
    if (page !== params.page && urlPage === params.page) {
      setSearchParams(toSearchParams({ ...params, page }), { replace: true });
    }
  }, [params, page, urlPage, setSearchParams]);
}

// useSearchParams reads the committed location. Controls build on a pending index navigation instead, so a
// change made while another one is still loading keeps it.
function useLatestListParams(
  location: Location,
  pending: Location | undefined,
): ListParams {
  const search =
    pending?.pathname === location.pathname ? pending.search : location.search;

  return useMemo(() => parseListParams(new URLSearchParams(search)), [search]);
}

// Zero means another tab or person deleted them first.
function deletedToast(deletedCount: number): string {
  if (deletedCount === 0) {
    return "Certificates already deleted";
  }

  if (deletedCount === 1) {
    return "Certificate deleted";
  }

  return `${pluralize(deletedCount, "certificate")} deleted`;
}

export function CertificatesIndexPage(props: IndexData) {
  const { rows, total, page, pageCount, storeIsEmpty } = props;
  const [, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const refreshing = revalidator.state === "loading";
  const busy = navigation.state !== "idle" || refreshing;
  const params = useLatestListParams(location, navigation.location);
  const selection = usePageSelection(
    location.key,
    rows.map((row) => row.id),
  );
  const selectedCodes = rows
    .filter((row) => selection.has(row.id))
    .map((row) => row.code);

  useAdminLoading(refreshing);
  useEffect(() => writeLastIndexSearch(location.search), [location.search]);
  useClampedPageUrl(props, params.page, setSearchParams);

  const applyPatch = useCallback<ListPatchHandler>(
    (patch) =>
      setSearchParams(toSearchParams(nextParams(params, patch)), {
        replace: true,
      }),
    [params, setSearchParams],
  );

  async function deleteSelected(): Promise<boolean> {
    const result = await requestJson<DeleteManyResponse>("/api/certificates", {
      body: { intent: "delete", ids: selection.ids },
      loading: true,
    });

    if (!result.ok) {
      return false;
    }

    shopify.toast.show(deletedToast(result.deleted.length));

    return true;
  }

  function afterDelete() {
    selection.clear();
    void revalidator.revalidate();
  }

  const view =
    params.view === "grid" ? (
      <CertificatesGrid
        rows={rows}
        params={params}
        total={total}
        page={page}
        pageCount={pageCount}
        busy={busy}
        onPatch={applyPatch}
      />
    ) : (
      <CertificatesTable
        rows={rows}
        params={params}
        total={total}
        page={page}
        pageCount={pageCount}
        busy={busy}
        selection={selection}
        onPatch={applyPatch}
      />
    );

  return (
    <s-page heading="Certificates" inlineSize="large">
      <s-button
        slot="primary-action"
        variant="primary"
        href="/app/certificates/new"
      >
        Create certificate
      </s-button>
      {storeIsEmpty ? (
        <FirstCertificateEmptyState />
      ) : (
        <s-section padding="none" accessibilityLabel="Certificates">
          {view}
        </s-section>
      )}
      <DeleteCertificatesModal
        id="bulk-delete-modal"
        codes={selectedCodes}
        onConfirm={deleteSelected}
        onDeleted={afterDelete}
      />
    </s-page>
  );
}
