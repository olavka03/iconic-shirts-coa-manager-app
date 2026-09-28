import { describe, expect, it } from "vitest";
import {
  legacyDictionary,
  legacyHistory,
  type LegacyHistoryItem,
} from "../../../../tests/helpers/legacy-history.fixture";
import { CODE_MAX, CODE_MIN, CODE_PATTERN } from "./code.utils";
import { resolveCollision, suggestCode } from "./code-suggestion.utils";

const HISTORY = legacyHistory();
const DICTIONARY = legacyDictionary(HISTORY);

const isCanonical = (code: string) =>
  CODE_PATTERN.test(code) && code.length >= CODE_MIN && code.length <= CODE_MAX;

function violation(certificate: LegacyHistoryItem): string | null {
  const { code, orderName, signerNames, item } = certificate;
  const others = new Set(
    HISTORY.map((historyItem) => historyItem.code).filter(
      (other) => other !== code,
    ),
  );
  const suggestion = suggestCode(
    { orderName: orderName ?? "", signerNames, item },
    DICTIONARY,
  );

  if (suggestion === null) {
    return `${code}: no suggestion`;
  }

  const resolved = resolveCollision(
    suggestion.code,
    others,
    suggestion.parts.season,
  );

  if (resolved === null) {
    return `${code}: every candidate after ${suggestion.code} is taken`;
  }

  if (others.has(resolved)) {
    return `${code}: suggested the existing ${resolved}`;
  }

  return isCanonical(resolved)
    ? null
    : `${code}: ${resolved} is not a canonical code`;
}

describe("suggestCode + resolveCollision over the 371 legacy certificates", () => {
  it("always resolves to a canonical code that no other certificate holds", () => {
    expect(HISTORY).toHaveLength(371);
    expect(
      HISTORY.map(violation).filter((message) => message !== null),
    ).toEqual([]);
  });
});
