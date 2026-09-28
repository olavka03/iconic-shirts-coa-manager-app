import { MONTHS_LONG } from "~/shared/utils/format.utils";
import {
  EARLIEST_SIGNING_YEAR,
  todayIsoLocal,
} from "~/shared/utils/signing-date.utils";
import type { DateDraft } from "~/features/certificates/types/certificate-form.types";

type DateSignedInputProps = {
  signerKey: string;
  value: DateDraft;
  onChange(value: DateDraft): void;
  error?: string;
  monthError?: string;
  yearError?: string;
};

type DayUnknownDraft = Extract<DateDraft, { dayUnknown: true }>;

const MONTH_OPTIONS = MONTHS_LONG.map((name, index) => ({
  name,
  value: String(index + 1).padStart(2, "0"),
}));

// A day is never invented: unticking keeps only the calendar month the merchant chose.
function withDayUnknown(value: DateDraft, dayUnknown: boolean): DateDraft {
  if (dayUnknown === value.dayUnknown) {
    return value;
  }

  if (!value.dayUnknown) {
    return {
      dayUnknown: true,
      month: value.iso.slice(5, 7),
      year: value.iso.slice(0, 4),
    };
  }

  const year = value.year.trim();
  const view =
    /^\d{4}$/.test(year) && value.month !== ""
      ? `${year}-${value.month}`
      : null;

  return { dayUnknown: false, iso: "", view };
}

function MonthAndYear({
  signerKey,
  value,
  onChange,
  error,
  monthError,
  yearError,
}: Omit<DateSignedInputProps, "value"> & { value: DayUnknownDraft }) {
  const today = todayIsoLocal();

  return (
    <s-grid gridTemplateColumns="2fr 1fr" gap="small">
      <s-select
        id={`signer-month-${signerKey}`}
        label="Month"
        placeholder="Select"
        error={monthError}
        onInput={(event) =>
          onChange({ ...value, month: event.currentTarget.value })
        }
      >
        {MONTH_OPTIONS.map((month) => (
          <s-option
            key={month.value}
            value={month.value}
            selected={month.value === value.month || undefined}
          >
            {month.name}
          </s-option>
        ))}
      </s-select>
      <s-number-field
        id={`signer-year-${signerKey}`}
        label="Year"
        inputMode="numeric"
        min={EARLIEST_SIGNING_YEAR}
        max={Number(today.slice(0, 4))}
        value={value.year}
        error={yearError ?? error}
        onInput={(event) =>
          onChange({ ...value, year: event.currentTarget.value })
        }
      />
    </s-grid>
  );
}

export function DateSignedInput(props: DateSignedInputProps) {
  const { signerKey, value, onChange, error } = props;

  return (
    <s-stack gap="small-200">
      {value.dayUnknown ? (
        <MonthAndYear {...props} value={value} />
      ) : (
        <s-date-field
          id={`signer-date-${signerKey}`}
          label="Date signed"
          allow={`--${todayIsoLocal()}`}
          view={value.view ?? undefined}
          value={value.iso}
          error={error}
          onInput={(event) =>
            onChange({ ...value, iso: event.currentTarget.value })
          }
        />
      )}
      <s-checkbox
        label="Day unknown"
        checked={value.dayUnknown || undefined}
        onInput={(event) =>
          onChange(withDayUnknown(value, event.currentTarget.checked))
        }
      />
    </s-stack>
  );
}
