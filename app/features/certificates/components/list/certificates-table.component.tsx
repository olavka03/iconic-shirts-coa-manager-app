import type { CertificateListItem } from "~/features/certificates/types/certificates.types";
import type {
  ListParams,
  ListPatchHandler,
} from "~/features/certificates/utils/list-params.utils";
import { thumbnailUrl } from "~/features/media/utils/media.utils";
import { BulkBar } from "./bulk-bar.component";
import { NoResultsEmptyState } from "./index-empty-states.component";
import { ListToolbar } from "./list-toolbar.component";
import { PaginationFooter } from "./pagination-footer.component";
import type { PageSelection } from "~/features/certificates/hooks/use-page-selection.hook";

type CertificatesTableProps = {
  rows: CertificateListItem[];
  params: ListParams;
  total: number;
  page: number;
  pageCount: number;
  busy: boolean;
  selection: PageSelection;
  onPatch: ListPatchHandler;
};

const FAILED_BADGE: Record<
  NonNullable<CertificateListItem["mediaFailed"]>,
  string
> = {
  photo: "Photo failed",
  video: "Video failed",
  both: "Photo and video failed",
};

function TextOrDash({ text }: { text: string | null }) {
  return text ? <s-text>{text}</s-text> : <s-text color="subdued">—</s-text>;
}

function ProofCell({ row }: { row: CertificateListItem }) {
  if (row.mediaFailed === null) {
    return <TextOrDash text={row.proofLabel} />;
  }

  return (
    <s-stack direction="inline" gap="small-200" alignItems="center">
      <TextOrDash text={row.proofLabel} />
      <s-badge tone="critical">{FAILED_BADGE[row.mediaFailed]}</s-badge>
    </s-stack>
  );
}

function CertificateRow({
  row,
  selected,
  onToggle,
}: {
  row: CertificateListItem;
  selected: boolean;
  onToggle: () => void;
}) {
  const linkId = `certificate-link-${row.id}`;

  return (
    <s-table-row clickDelegate={linkId}>
      <s-table-cell>
        <s-grid
          gridTemplateColumns="auto auto 1fr"
          gap="small"
          alignItems="center"
        >
          <s-checkbox
            accessibilityLabel={`Select ${row.code}`}
            checked={selected || undefined}
            onInput={onToggle}
          />
          <s-thumbnail
            size="small-200"
            alt=""
            src={row.imageUrl ? thumbnailUrl(row.imageUrl, 80) : undefined}
          />
          <s-link id={linkId} href={`/app/certificates/${row.id}`}>
            {row.code}
          </s-link>
        </s-grid>
      </s-table-cell>
      <s-table-cell>
        <TextOrDash text={row.signedBy} />
      </s-table-cell>
      <s-table-cell>
        <TextOrDash text={row.item} />
      </s-table-cell>
      <s-table-cell>
        <TextOrDash text={row.dateLabel} />
      </s-table-cell>
      <s-table-cell>
        <ProofCell row={row} />
      </s-table-cell>
      <s-table-cell>
        <TextOrDash text={row.orderName} />
      </s-table-cell>
    </s-table-row>
  );
}

export function CertificatesTable({
  rows,
  params,
  total,
  page,
  pageCount,
  busy,
  selection,
  onPatch,
}: CertificatesTableProps) {
  return (
    <>
      <s-table loading={busy || undefined}>
        {selection.ids.length > 0 ? (
          <BulkBar selection={selection} />
        ) : (
          <ListToolbar
            slot="filters"
            params={params}
            total={total}
            onPatch={onPatch}
          />
        )}
        <s-table-header-row>
          <s-table-header listSlot="primary">
            <s-grid
              gridTemplateColumns="auto 1fr"
              gap="small"
              alignItems="center"
            >
              <s-checkbox
                accessibilityLabel="Select all certificates on this page"
                checked={selection.all || undefined}
                indeterminate={selection.some || undefined}
                onInput={selection.toggleAll}
              />
              <s-text>Certificate</s-text>
            </s-grid>
          </s-table-header>
          <s-table-header listSlot="inline">Signed by</s-table-header>
          <s-table-header listSlot="labeled">Item</s-table-header>
          <s-table-header listSlot="secondary">Date signed</s-table-header>
          <s-table-header listSlot="labeled">Proof</s-table-header>
          <s-table-header listSlot="labeled">Order</s-table-header>
        </s-table-header-row>
        <s-table-body>
          {rows.map((row) => (
            <CertificateRow
              key={row.id}
              row={row}
              selected={selection.has(row.id)}
              onToggle={() => selection.toggle(row.id)}
            />
          ))}
          {rows.length === 0 && !busy ? (
            <NoResultsEmptyState params={params} onPatch={onPatch} />
          ) : null}
        </s-table-body>
      </s-table>
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
