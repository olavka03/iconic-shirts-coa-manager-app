import { describe, expect, it } from "vitest";
import type { DictionaryStrategy } from "~/features/codes/types/code-generator.types";
import { parseCode } from "~/features/codes/utils/code.utils";
import { suggestCode } from "~/features/codes/utils/code-suggestion.utils";
import { extractSeason } from "~/features/codes/utils/season.utils";
import { buildTeamDictionary } from "~/features/codes/utils/team-dictionary.utils";
import {
  LEGACY_SHOP_NAME,
  legacyHistory,
  type LegacyHistoryItem,
} from "../helpers/legacy-history.fixture";

type Outcome = {
  exact: boolean;
  seasonAdded: boolean;
  prefix: boolean;
  series: boolean;
};

const HISTORY = legacyHistory();
const NEWEST_50 = HISTORY.filter((historyItem) => historyItem.index < 50);

// Temporal: the dictionary knows only certificates older than the one predicted, as the app would.
function outcome(
  certificate: LegacyHistoryItem,
  strategy: DictionaryStrategy,
): Outcome {
  const dictionary = buildTeamDictionary(
    HISTORY.filter((older) => older.index > certificate.index),
    { strategy, shopName: LEGACY_SHOP_NAME },
  );
  const actual = parseCode(certificate.code, certificate.orderName);
  const suggestion = suggestCode(
    {
      orderName: certificate.orderName ?? "",
      signerNames: certificate.signerNames,
      item: certificate.item,
    },
    dictionary,
  );

  if (actual === null || suggestion === null) {
    throw new Error(`${certificate.code} doesn't parse or gets no suggestion`);
  }

  const exact = suggestion.code === certificate.code;
  // Legacy codes often lack the season the store now appends; the suggestion adding it still matches.
  const seasonAdded =
    !/\d$/.test(actual.suffix) &&
    extractSeason(certificate.item) !== null &&
    suggestion.code ===
      certificate.code.replace(/-/g, "") + suggestion.parts.season;

  return {
    exact,
    seasonAdded,
    prefix: suggestion.parts.prefix === actual.prefix,
    series: suggestion.source === "series",
  };
}

function score(
  strategy: DictionaryStrategy,
  subset: readonly LegacyHistoryItem[],
) {
  const outcomes = subset.map((certificate) => outcome(certificate, strategy));
  const count = (test: (result: Outcome) => boolean) =>
    outcomes.filter(test).length;

  return {
    exact: count((result) => result.exact),
    adjusted: count((result) => result.exact || result.seasonAdded),
    prefix: count((result) => result.prefix),
    series: count((result) => result.series),
    seriesExact: count((result) => result.series && result.exact),
  };
}

describe("code generator accuracy floor (spec §12.2, measured with this implementation)", () => {
  it("newest 50: exact ≥ 29, prefix 50, product memory ≥ 15 right", () => {
    const scores = score("recent", NEWEST_50);

    expect(scores.exact).toBeGreaterThanOrEqual(29); // measured 30
    expect(scores.prefix).toBe(50);
    expect(scores.seriesExact).toBeGreaterThanOrEqual(15); // measured 17 of 20
  });

  it("all 371, convention-adjusted ≥ 250", () => {
    expect(HISTORY).toHaveLength(371);
    expect(score("recent", HISTORY).adjusted).toBeGreaterThanOrEqual(250); // measured 257
  });

  it("prints the weighted strategy for Q7 (not asserted)", () => {
    console.info(
      "weighted newest 50",
      score("weighted", NEWEST_50),
      "all",
      score("weighted", HISTORY),
    );
  });
});
