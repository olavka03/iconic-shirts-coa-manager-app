export type LegacyOverride = {
  match: { certificate_verification: string };
  replace?: { field: string; from: string; to: string }[];
  reason?: string;
  note?: string;
};
export type AppliedOverride = {
  field: string;
  from: string;
  to: string;
  reason: string;
};

export const LEGACY_OVERRIDES: LegacyOverride[] = [
  {
    match: { certificate_verification: "IS141909ARS0" },
    replace: [
      {
        field: "signed",
        from: "Kolo Toure 4th March,",
        to: "Kolo Toure 4th March 2022,",
      },
    ],
    reason:
      "Year missing. The list is chronological: 10 June 2021 < 4 March 2022 < 12 September 2022.",
  },
  {
    match: { certificate_verification: "IS141595MBRGN" },
    replace: [
      { field: "date", from: "(Frank Lampard)", to: "(Marco van Basten)" },
    ],
    reason:
      "Date attributed to Frank Lampard, who did not sign this shirt; the other date is Gullit's.",
  },
  {
    match: { certificate_verification: "IS141420RCMC" },
    replace: [{ field: "date", from: "30 July 20225", to: "30 July 2025" }],
    reason: "Year typo.",
  },
  {
    match: { certificate_verification: "IS141434THDBA" },
    note: "Bergkamp dated 29 October 2025; the sibling THDBA certificates say 2024. Imported as written.",
  },
];

// Overrides match raw fields, never array indexes: new records are added at the top, so indexes
// shift. A `from` that is no longer found throws, so a stale fix fails loudly.
export function applyOverrides(
  original: Record<string, unknown>,
  overrides: readonly LegacyOverride[] = LEGACY_OVERRIDES,
): {
  record: Record<string, unknown>;
  applied: AppliedOverride[];
  notes: string[];
} {
  const record = { ...original };
  const applied: AppliedOverride[] = [];
  const notes: string[] = [];
  const code =
    typeof original.certificate_verification === "string"
      ? original.certificate_verification.trim()
      : "";
  const matching = overrides.filter(
    (override) => override.match.certificate_verification === code,
  );

  for (const override of matching) {
    if (override.note) {
      notes.push(override.note);
    }

    for (const replacement of override.replace ?? []) {
      const value = record[replacement.field];

      if (typeof value !== "string" || !value.includes(replacement.from)) {
        throw new Error(
          `Stale legacy override for ${code}: "${replacement.from}" not found in ${replacement.field}.`,
        );
      }

      record[replacement.field] = value.replace(
        replacement.from,
        () => replacement.to,
      );
      applied.push({ ...replacement, reason: override.reason ?? "" });
    }
  }

  return { record, applied, notes };
}
