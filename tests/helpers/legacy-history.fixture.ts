import { codeError, parseCode } from "~/features/codes/utils/code.utils";
import type {
  CodeHistoryItem,
  TeamDictionary,
} from "~/features/codes/types/code-generator.types";
import { buildTeamDictionary } from "~/features/codes/utils/team-dictionary.utils";
import { parseLegacyRecord } from "../../scripts/legacy-import/legacy-record.utils";
import fixture from "../fixtures/legacy-certificates.fixture.json";

export const LEGACY_NOW = new Date("2026-09-26T12:00:00Z");
export const LEGACY_SHOP_NAME = "Iconic Shirts";

export type LegacyHistoryItem = CodeHistoryItem & {
  index: number;
  photo: string;
};

// The importable certificates, newest first like the fixture. orderToken reads only the digits of an
// order name, so the code's digit run stands in for the order name the legacy records lack.
export function legacyHistory(): LegacyHistoryItem[] {
  const seen = new Set<string>();

  return (fixture as Record<string, unknown>[]).flatMap((record, index) => {
    const parsed = parseLegacyRecord(record, { now: LEGACY_NOW });

    if (codeError(parsed.code) !== null || seen.has(parsed.code)) {
      return [];
    }

    seen.add(parsed.code);

    return [
      {
        index,
        code: parsed.code,
        item: parsed.item,
        signerNames: parsed.signers.map((signer) => signer.name),
        orderName: parseCode(parsed.code)?.number ?? null,
        productId: null,
        photo: typeof record.photo === "string" ? record.photo : "",
      },
    ];
  });
}

export function legacyDictionary(
  history: readonly CodeHistoryItem[] = legacyHistory(),
): TeamDictionary {
  return buildTeamDictionary(history, { shopName: LEGACY_SHOP_NAME });
}
