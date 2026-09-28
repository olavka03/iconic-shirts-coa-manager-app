import type { CertificateListItem } from "~/features/certificates/types/certificates.types";
import type {
  ListParams,
  ListPatchHandler,
} from "~/features/certificates/utils/list-params.utils";
import { GridCard } from "./grid-card.component";
import { NoResultsEmptyState } from "./index-empty-states.component";
import { ListToolbar } from "./list-toolbar.component";
import { PaginationFooter } from "./pagination-footer.component";

export const GRID_COLUMNS =
  "@container (inline-size > 560px) 1fr 1fr 1fr 1fr, (inline-size > 900px) 1fr 1fr 1fr 1fr 1fr, (inline-size > 1200px) 1fr 1fr 1fr 1fr 1fr 1fr, 1fr 1fr 1fr";

type CertificatesGridProps = {
  rows: CertificateListItem[];
  params: ListParams;
  total: number;
  page: number;
  pageCount: number;
  busy: boolean;
  onPatch: ListPatchHandler;
};

function GridContent({
  rows,
  params,
  busy,
  onPatch,
}: Pick<CertificatesGridProps, "rows" | "params" | "busy" | "onPatch">) {
  if (rows.length === 0) {
    return busy ? null : (
      <NoResultsEmptyState params={params} onPatch={onPatch} />
    );
  }

  return (
    <s-query-container>
      <s-grid gap="base" gridTemplateColumns={GRID_COLUMNS}>
        {rows.map((row) => (
          <GridCard key={row.id} row={row} />
        ))}
      </s-grid>
    </s-query-container>
  );
}

export function CertificatesGrid({
  rows,
  params,
  total,
  page,
  pageCount,
  busy,
  onPatch,
}: CertificatesGridProps) {
  return (
    <>
      <s-box padding="small">
        <ListToolbar params={params} total={total} onPatch={onPatch} />
      </s-box>
      <s-divider />
      <s-box padding="base">
        <GridContent
          rows={rows}
          params={params}
          busy={busy}
          onPatch={onPatch}
        />
      </s-box>
      <s-divider />
      <PaginationFooter
        params={params}
        page={page}
        pageCount={pageCount}
        total={total}
      />
    </>
  );
}
