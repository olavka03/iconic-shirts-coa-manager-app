import type { PageSelection } from "~/features/certificates/hooks/use-page-selection.hook";

export function BulkBar({ selection }: { selection: PageSelection }) {
  return (
    <s-box slot="filters" padding="small" background="strong">
      <s-stack
        direction="inline"
        justifyContent="space-between"
        alignItems="center"
      >
        <s-checkbox
          label={`${selection.ids.length} selected`}
          checked={selection.all || undefined}
          indeterminate={selection.some || undefined}
          onInput={selection.toggleAll}
        />
        <s-button
          tone="critical"
          commandFor="bulk-delete-modal"
          command="--show"
        >
          Delete
        </s-button>
      </s-stack>
    </s-box>
  );
}
