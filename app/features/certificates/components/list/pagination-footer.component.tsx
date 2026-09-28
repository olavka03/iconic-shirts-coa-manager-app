import type { ListParams } from "~/features/certificates/utils/list-params.utils";
import { pageHref } from "~/features/certificates/utils/index-state.utils";
import {
  pageWindow,
  rangeText,
} from "~/features/certificates/utils/page-window.utils";

// Numbered pages need room; a narrow list shows "Page n of count" between the arrows instead.
const WIDE_ONLY = "@container (inline-size > 560px) auto, none";
const NARROW_ONLY = "@container (inline-size > 560px) none, auto";

type PaginationFooterProps = {
  params: ListParams;
  page: number;
  pageCount: number;
  total: number;
};

function PageButton({
  params,
  number,
  current,
}: {
  params: ListParams;
  number: number;
  current: boolean;
}) {
  return (
    <s-button
      href={pageHref(params, number)}
      variant={current ? "primary" : "tertiary"}
      accessibilityLabel={
        current ? `Page ${number}, current page` : `Page ${number}`
      }
      aria-current={current ? "page" : undefined}
    >
      {String(number)}
    </s-button>
  );
}

function PageControls({
  params,
  page,
  pageCount,
}: Omit<PaginationFooterProps, "total">) {
  return (
    <s-stack direction="inline" gap="small-200" alignItems="center">
      <s-button
        icon="chevron-left"
        accessibilityLabel="Previous page"
        href={pageHref(params, Math.max(page - 1, 1))}
        disabled={page <= 1 || undefined}
      />
      <s-box display={WIDE_ONLY}>
        <s-stack direction="inline" gap="small-200" alignItems="center">
          {pageWindow(page, pageCount).map((slot, position) =>
            slot === "gap" ? (
              <span key={`gap-${position}`} aria-hidden="true">
                <s-text color="subdued">…</s-text>
              </span>
            ) : (
              <PageButton
                key={slot}
                params={params}
                number={slot}
                current={slot === page}
              />
            ),
          )}
        </s-stack>
      </s-box>
      <s-box display={NARROW_ONLY}>
        <s-text>{`Page ${page} of ${pageCount}`}</s-text>
      </s-box>
      <s-button
        icon="chevron-right"
        accessibilityLabel="Next page"
        href={pageHref(params, Math.min(page + 1, pageCount))}
        disabled={page >= pageCount || undefined}
      />
    </s-stack>
  );
}

export function PaginationFooter({
  params,
  page,
  pageCount,
  total,
}: PaginationFooterProps) {
  const range = rangeText(page, params.perPage, total);

  if (range === null && pageCount <= 1) {
    return null;
  }

  return (
    <s-box padding="small">
      <s-query-container>
        {/* The empty last cell mirrors the range, so the controls sit in the middle. */}
        <s-grid
          gridTemplateColumns="1fr auto 1fr"
          gap="small"
          alignItems="center"
        >
          <s-text color="subdued">{range ?? ""}</s-text>
          {pageCount > 1 ? (
            <PageControls params={params} page={page} pageCount={pageCount} />
          ) : (
            <s-box />
          )}
          <s-box />
        </s-grid>
      </s-query-container>
    </s-box>
  );
}
