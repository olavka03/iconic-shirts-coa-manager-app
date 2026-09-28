import { useEffect, useRef, useState } from "react";
import {
  parseDay,
  parsePresence,
  type ListParams,
  type ListPatchHandler,
  type Presence,
} from "~/features/certificates/utils/list-params.utils";
import { todayIsoLocal } from "~/shared/utils/signing-date.utils";
import { dateRangeError } from "~/features/certificates/utils/index-state.utils";
import { useUrlDraft } from "~/shared/hooks/use-url-draft.hook";

type FilterPopoverProps = {
  params: ListParams;
  onPatch: ListPatchHandler;
};

function isEnteredDay(value: string): boolean {
  return value === "" || parseDay(value) !== null;
}

// The viewer's calendar day exists only in the browser, so the server renders the fields without a limit.
function useTodayIso(): string | null {
  const [today, setToday] = useState<string | null>(null);

  useEffect(() => setToday(todayIsoLocal()), []);

  return today;
}

function PresenceChoiceList({
  label,
  name,
  value,
  yesLabel,
  noLabel,
  onChange,
}: {
  label: string;
  name: string;
  value: Presence | null;
  yesLabel: string;
  noLabel: string;
  onChange: (value: Presence | null) => void;
}) {
  return (
    <s-choice-list
      label={label}
      name={name}
      onInput={(event) =>
        onChange(parsePresence(event.currentTarget.values[0]))
      }
    >
      <s-choice value="any" selected={value === null || undefined}>
        Any
      </s-choice>
      <s-choice value="yes" selected={value === "yes" || undefined}>
        {yesLabel}
      </s-choice>
      <s-choice value="no" selected={value === "no" || undefined}>
        {noLabel}
      </s-choice>
    </s-choice-list>
  );
}

export function FilterPopover({ params, onPatch }: FilterPopoverProps) {
  const fromRef = useRef<HTMLElementTagNameMap["s-date-field"]>(null);
  const toRef = useRef<HTMLElementTagNameMap["s-date-field"]>(null);
  const [from, setFrom] = useUrlDraft(params.signedFrom ?? "", fromRef);
  const [to, setTo] = useUrlDraft(params.signedTo ?? "", toRef);
  const today = useTodayIso();
  const allow = today === null ? undefined : `--${today}`;
  const rangeError = dateRangeError(from, to);

  // A calendar pick fires only change; typing fires input on every keystroke, so a partial date waits.
  function changeDates(nextFrom: string, nextTo: string) {
    setFrom(nextFrom);
    setTo(nextTo);

    if (!isEnteredDay(nextFrom) || !isEnteredDay(nextTo)) {
      return;
    }

    const signedFrom = parseDay(nextFrom);
    const signedTo = parseDay(nextTo);
    const changed =
      signedFrom !== params.signedFrom || signedTo !== params.signedTo;

    if (changed && dateRangeError(nextFrom, nextTo) === null) {
      onPatch({ signedFrom, signedTo });
    }
  }

  return (
    <s-popover id="filter-popover">
      <s-box padding="base">
        <s-stack gap="base">
          <PresenceChoiceList
            label="Photo"
            name="photo"
            value={params.photo}
            yesLabel="Has photo"
            noLabel="No photo"
            onChange={(photo) => onPatch({ photo })}
          />
          <PresenceChoiceList
            label="Video"
            name="video"
            value={params.video}
            yesLabel="Has video"
            noLabel="No video"
            onChange={(video) => onPatch({ video })}
          />
          <s-divider />
          <s-stack gap="small">
            <s-date-field
              ref={fromRef}
              label="Signed from"
              allow={allow}
              value={from}
              onInput={(event) => changeDates(event.currentTarget.value, to)}
              onChange={(event) => changeDates(event.currentTarget.value, to)}
            />
            <s-date-field
              ref={toRef}
              label="Signed to"
              allow={allow}
              value={to}
              error={rangeError ?? undefined}
              onInput={(event) => changeDates(from, event.currentTarget.value)}
              onChange={(event) => changeDates(from, event.currentTarget.value)}
            />
          </s-stack>
        </s-stack>
      </s-box>
    </s-popover>
  );
}
