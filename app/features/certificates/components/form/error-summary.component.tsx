import { useEffect, useRef } from "react";
import type { FieldErrors } from "~/shared/types/api.types";
import {
  orderedErrors,
  summaryHeading,
  type SummaryEntry,
} from "~/features/certificates/utils/field-labels.utils";

type ErrorSummaryProps = {
  errors: FieldErrors;
  onFocusField(key: string): void;
};

function SummaryBanner({
  entries,
  onFocusField,
}: {
  entries: SummaryEntry[];
  onFocusField(key: string): void;
}) {
  // Captured once: focus moves when the banner appears, not while the merchant fixes fields.
  const focusFirstField = useRef(() => onFocusField(entries[0].key));

  useEffect(() => {
    focusFirstField.current();
  }, []);

  return (
    <s-banner
      slot="supplemental-start"
      tone="critical"
      heading={summaryHeading(entries.length)}
    >
      <s-unordered-list>
        {entries.map((entry) => (
          <s-list-item key={entry.key}>
            {`${entry.label}: ${entry.message}`}
          </s-list-item>
        ))}
      </s-unordered-list>
    </s-banner>
  );
}

export function ErrorSummary({ errors, onFocusField }: ErrorSummaryProps) {
  const entries = orderedErrors(errors);

  if (entries.length === 0) {
    return null;
  }

  return <SummaryBanner entries={entries} onFocusField={onFocusField} />;
}
