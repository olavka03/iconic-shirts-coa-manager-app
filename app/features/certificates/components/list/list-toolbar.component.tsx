import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useDebouncedValue } from "~/shared/hooks/use-debounced-value.hook";
import {
  hasActiveFilters,
  parsePerPage,
  PER_PAGE_OPTIONS,
  type ListParams,
  type ListPatchHandler,
  type PerPage,
} from "~/features/certificates/utils/list-params.utils";
import { useDomEvent } from "~/shared/hooks/use-dom-event.hook";
import { AppliedFilters } from "./applied-filters.component";
import { FilterPopover } from "./filter-popover.component";
import { SortPopover } from "./sort-popover.component";
import { useUrlDraft } from "~/shared/hooks/use-url-draft.hook";

const SEARCH_DELAY_MS = 300;
// Wide: the search takes the free width, the controls sit at the end. Narrow: the controls go on the next row.
export const TOOLBAR_COLUMNS = "@container (inline-size > 720px) 1fr auto, 1fr";
// Form controls fill their column, so each control gets its own; the select stays compact.
export const TOOLBAR_CONTROL_COLUMNS = "auto auto 150px auto";

type ListToolbarProps = {
  slot?: "filters";
  params: ListParams;
  total: number;
  onPatch: ListPatchHandler;
};

function SearchField({
  query,
  onSearch,
}: {
  query: string;
  onSearch: (query: string) => void;
}) {
  const fieldRef = useRef<HTMLElementTagNameMap["s-search-field"]>(null);
  const [text, setText] = useUrlDraft(query, fieldRef);
  const debounced = useDebouncedValue(text, SEARCH_DELAY_MS);
  const lastDebounced = useRef(debounced);
  const sent = useRef(query);

  const submit = useCallback(
    (value: string) => {
      sent.current = value;

      if (value.trim() !== query) {
        onSearch(value.trim());
      }
    },
    [query, onSearch],
  );

  // submit changes after every navigation while the debounced value can still hold the text from before an
  // Enter, so only a new debounced value searches.
  useEffect(() => {
    if (debounced === lastDebounced.current) {
      return;
    }

    lastDebounced.current = debounced;

    if (debounced !== sent.current) {
      submit(debounced);
    }
  }, [debounced, submit]);

  useDomEvent(fieldRef, "keydown", (event) => {
    if (event instanceof KeyboardEvent && event.key === "Enter") {
      submit(text);
    }
  });

  return (
    <s-search-field
      ref={fieldRef}
      label="Search certificates"
      labelAccessibilityVisibility="exclusive"
      placeholder="Search by code, signer, item, or order number"
      autocomplete="off"
      value={text}
      onInput={(event) => setText(event.currentTarget.value)}
    />
  );
}

function PerPageSelect({
  perPage,
  onPatch,
}: {
  perPage: PerPage;
  onPatch: ListPatchHandler;
}) {
  return (
    <s-select
      label="Per page"
      labelAccessibilityVisibility="exclusive"
      value={String(perPage)}
      onChange={(event) =>
        onPatch({ perPage: parsePerPage(event.currentTarget.value) })
      }
    >
      {PER_PAGE_OPTIONS.map((option) => (
        <s-option
          key={option}
          value={String(option)}
          selected={option === perPage || undefined}
        >
          {`${option} per page`}
        </s-option>
      ))}
    </s-select>
  );
}

function ViewButton({
  pressed,
  onPress,
  children,
}: {
  pressed: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <s-press-button
      slot="secondary-actions"
      pressed={pressed || undefined}
      onClick={(event) => {
        if (pressed) {
          // A press button flips itself on every click; the current view stays pressed.
          event.currentTarget.pressed = true;

          return;
        }

        onPress();
      }}
    >
      {children}
    </s-press-button>
  );
}

export function ListToolbar({
  slot,
  params,
  total,
  onPatch,
}: ListToolbarProps) {
  const filtered = hasActiveFilters(params);
  const onSearch = useCallback(
    (query: string) => onPatch({ query }),
    [onPatch],
  );

  return (
    <s-stack slot={slot} gap="small-200">
      <s-query-container>
        <s-grid
          gridTemplateColumns={TOOLBAR_COLUMNS}
          gap="small-200"
          alignItems="center"
        >
          <SearchField query={params.query} onSearch={onSearch} />
          <s-grid
            gridTemplateColumns={TOOLBAR_CONTROL_COLUMNS}
            gap="small-200"
            alignItems="center"
            justifyContent="end"
          >
            <s-button
              icon={filtered ? "filter-active" : "filter"}
              variant="secondary"
              accessibilityLabel="Filter"
              commandFor="filter-popover"
              interestFor="filter-tip"
            />
            <s-button
              icon="sort"
              variant="secondary"
              accessibilityLabel="Sort"
              commandFor="sort-popover"
              interestFor="sort-tip"
            />
            <PerPageSelect perPage={params.perPage} onPatch={onPatch} />
            <s-button-group gap="none" accessibilityLabel="View">
              <ViewButton
                pressed={params.view === "table"}
                onPress={() => onPatch({ view: "table" })}
              >
                Table
              </ViewButton>
              <ViewButton
                pressed={params.view === "grid"}
                onPress={() => onPatch({ view: "grid" })}
              >
                Grid
              </ViewButton>
            </s-button-group>
          </s-grid>
        </s-grid>
      </s-query-container>
      <s-tooltip id="filter-tip">Filter</s-tooltip>
      <s-tooltip id="sort-tip">Sort</s-tooltip>
      <FilterPopover params={params} onPatch={onPatch} />
      <SortPopover params={params} onPatch={onPatch} />
      {params.query !== "" || filtered ? (
        <AppliedFilters params={params} total={total} onPatch={onPatch} />
      ) : null}
    </s-stack>
  );
}
