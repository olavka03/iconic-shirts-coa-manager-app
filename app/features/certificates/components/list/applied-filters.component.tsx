import { useRef } from "react";
import type {
  ListParams,
  ListPatchHandler,
} from "~/features/certificates/utils/list-params.utils";
import { useDomEvent } from "~/shared/hooks/use-dom-event.hook";
import {
  CLEAR_ALL,
  chipsFor,
  resultCount,
  type FilterChipData,
} from "~/features/certificates/utils/index-state.utils";

type AppliedFiltersProps = {
  params: ListParams;
  total: number;
  onPatch: ListPatchHandler;
};

function FilterChip({
  chip,
  onRemove,
}: {
  chip: FilterChipData;
  onRemove: () => void;
}) {
  const chipRef = useRef<HTMLElementTagNameMap["s-clickable-chip"]>(null);

  useDomEvent(chipRef, "remove", onRemove);

  return (
    <s-clickable-chip
      ref={chipRef}
      removable
      commandFor="filter-popover"
      accessibilityLabel={chip.accessibilityLabel}
    >
      {chip.label}
    </s-clickable-chip>
  );
}

export function AppliedFilters({
  params,
  total,
  onPatch,
}: AppliedFiltersProps) {
  return (
    <s-stack direction="inline" gap="small-200" alignItems="center">
      {chipsFor(params).map((chip) => (
        <FilterChip
          key={chip.key}
          chip={chip}
          onRemove={() => onPatch(chip.remove)}
        />
      ))}
      <s-button variant="tertiary" onClick={() => onPatch(CLEAR_ALL)}>
        Clear all
      </s-button>
      <s-text color="subdued">{resultCount(total)}</s-text>
    </s-stack>
  );
}
