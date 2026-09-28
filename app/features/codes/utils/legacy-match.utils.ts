import type { TeamDictionary } from "~/features/codes/types/code-generator.types";
import { parseProductTitle } from "./product-title.utils";
import { extractSeason, formatSeason } from "./season.utils";
import { signerKey } from "./signer-initials.utils";
import { extractTeam, isKnownTeam, resolveTeamKey } from "./team-names.utils";

export type LegacyCertificate = {
  id: string;
  code: string;
  item: string;
  signerNames: string[];
};

const resolvedTeamKey = (
  item: string,
  signerNames: readonly string[],
  dictionary: TeamDictionary,
) => resolveTeamKey(extractTeam(item, signerNames)?.key ?? "", dictionary);

const seasonsAgree = (first: string, second: string) =>
  first === "" || second === "" || first === second;

// Every order item each imported certificate could belong to: same team, agreeing seasons, and
// every signer of the item among the certificate's signers.
export function legacyCandidateItems(
  legacy: readonly LegacyCertificate[],
  items: readonly { id: string; title: string }[],
  dictionary: TeamDictionary,
): Map<string, string[]> {
  const candidates = items.map((item) => {
    const parsedTitle = parseProductTitle(item.title, {
      isTeam: (name) => isKnownTeam(name, dictionary),
    });

    return {
      id: item.id,
      team: resolvedTeamKey(parsedTitle.item, parsedTitle.signers, dictionary),
      season: formatSeason(extractSeason(parsedTitle.item)),
      signerKeys: parsedTitle.signers.map(signerKey),
    };
  });

  return new Map(
    legacy.map((certificate) => {
      const team = resolvedTeamKey(
        certificate.item,
        certificate.signerNames,
        dictionary,
      );
      const season = formatSeason(extractSeason(certificate.item));
      const signers = new Set(certificate.signerNames.map(signerKey));
      const matches = candidates.filter(
        (candidate) =>
          candidate.team !== "" &&
          candidate.team === team &&
          seasonsAgree(candidate.season, season) &&
          candidate.signerKeys.every((key) => signers.has(key)),
      );

      return [certificate.id, matches.map((candidate) => candidate.id)];
    }),
  );
}

// Imported certificates have no line item. This only hints at the one order item each clearly matches
// (spec §4.3), so it never guesses: zero or several candidate items leave the certificate unmatched.
export function matchLegacyToItems(
  legacy: readonly LegacyCertificate[],
  items: readonly { id: string; title: string }[],
  dictionary: TeamDictionary,
): Map<string, string> {
  const itemByCertificate = new Map<string, string>();

  for (const [certificateId, itemIds] of legacyCandidateItems(
    legacy,
    items,
    dictionary,
  )) {
    if (itemIds.length === 1) {
      itemByCertificate.set(certificateId, itemIds[0]);
    }
  }

  return itemByCertificate;
}
