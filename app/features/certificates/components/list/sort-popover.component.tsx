import {
  LIST_SORTS,
  parseDirection,
  parseSort,
  type ListParams,
  type ListPatchHandler,
  type ListSort,
  type SortDirection,
} from "~/features/certificates/utils/list-params.utils";

type SortPopoverProps = {
  params: ListParams;
  onPatch: ListPatchHandler;
};

const SORT_LABELS: Record<ListSort, string> = {
  created: "Date created",
  updated: "Last updated",
  signed: "Date signed",
  code: "Certificate code",
};

const DATE_DIRECTIONS: { value: SortDirection; label: string }[] = [
  { value: "desc", label: "Newest first" },
  { value: "asc", label: "Oldest first" },
];

const CODE_DIRECTIONS: { value: SortDirection; label: string }[] = [
  { value: "asc", label: "A–Z" },
  { value: "desc", label: "Z–A" },
];

export function SortPopover({ params, onPatch }: SortPopoverProps) {
  const byCode = params.sort === "code";
  const directions = byCode ? CODE_DIRECTIONS : DATE_DIRECTIONS;

  return (
    <s-popover id="sort-popover">
      <s-stack gap="none">
        <s-box padding="small">
          <s-choice-list
            label="Sort by"
            name="sort"
            onInput={(event) => {
              const sort = parseSort(event.currentTarget.values[0]);

              if (sort !== null) {
                onPatch({ sort });
              }
            }}
          >
            {LIST_SORTS.map((sort) => (
              <s-choice
                key={sort}
                value={sort}
                selected={params.sort === sort || undefined}
              >
                {SORT_LABELS[sort]}
              </s-choice>
            ))}
          </s-choice-list>
        </s-box>
        <s-divider />
        <s-box padding="small">
          <s-choice-list
            key={byCode ? "code" : "date"}
            label="Sort direction"
            labelAccessibilityVisibility="exclusive"
            name="dir"
            onInput={(event) => {
              const direction = parseDirection(event.currentTarget.values[0]);

              if (direction !== null) {
                onPatch({ direction });
              }
            }}
          >
            {directions.map((direction) => (
              <s-choice
                key={direction.value}
                value={direction.value}
                selected={params.direction === direction.value || undefined}
              >
                {direction.label}
              </s-choice>
            ))}
          </s-choice-list>
        </s-box>
      </s-stack>
    </s-popover>
  );
}
