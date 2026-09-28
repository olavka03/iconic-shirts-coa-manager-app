import type { SignerKind } from "~/features/codes/types/code-generator.types";
import { initialsVariants, signerKind } from "./signer-initials.utils";
import { extractTeam } from "./team-names.utils";

export type Segments = {
  letters: string;
  initials: string | null;
  team: string | null;
  season: string;
  teamKey: string;
  kind: SignerKind;
  ok: boolean;
  irregular?: boolean;
};

export const isSegmented = (
  segments: Segments,
): segments is Segments & { initials: string; team: string } => segments.ok;

function pairCandidates(
  firstVariants: string[],
  secondVariants: string[],
): string[] {
  const combine = (leading: string[], trailing: string[]) =>
    leading.flatMap((leadingInitials) =>
      trailing.map((trailingInitials) => leadingInitials + trailingInitials),
    );

  return [
    ...new Set([
      firstVariants[0] + secondVariants[0],
      secondVariants[0] + firstVariants[0],
      ...combine(firstVariants, secondVariants),
      ...combine(secondVariants, firstVariants),
    ]),
  ];
}

function longestKnownEnding(
  votes: ReadonlyMap<string, { count: number }>,
  letters: string,
): string | undefined {
  return [...votes.keys()]
    .filter(
      (ending) =>
        ending && letters.length > ending.length && letters.endsWith(ending),
    )
    .sort((left, right) => right.length - left.length)[0];
}

type Reading = { initials: string; team: string; score: number };

function bestReading(
  candidates: string[],
  letters: string,
  votes: ReadonlyMap<string, { count: number }> | undefined,
): Reading | null {
  return candidates.reduce<Reading | null>((bestSoFar, initials, index) => {
    if (!letters.startsWith(initials)) {
      return bestSoFar;
    }

    const team = letters.slice(initials.length);
    // Votes dominate, the default reading breaks ties, and earlier variants take what is left.
    const score =
      (votes?.get(team)?.count ?? 0) * 10 +
      (index === 0 ? 5 : 0) -
      index * 0.01;

    return bestSoFar === null || score > bestSoFar.score
      ? { initials, team, score }
      : bestSoFar;
  }, null);
}

// Learning only: splits the letters after a stored code's order number into initials and team.
export function segmentSuffix(
  suffix: string,
  signerNames: readonly string[],
  item: string,
  teamVotes?: ReadonlyMap<string, ReadonlyMap<string, { count: number }>>,
): Segments {
  const season = (/\d+$/.exec(suffix) ?? [""])[0];
  const letters = suffix.slice(0, suffix.length - season.length);
  const key = extractTeam(item, signerNames)?.key ?? "";
  const kind = signerKind(signerNames);
  const base = { letters, season, teamKey: key, kind };

  if (kind === "group" || kind === "none") {
    return { ...base, initials: "", team: letters, ok: true };
  }

  const candidates =
    kind === "single"
      ? initialsVariants(signerNames[0])
      : pairCandidates(
          initialsVariants(signerNames[0]),
          initialsVariants(signerNames[1]),
        );
  const votes = teamVotes?.get(key);
  const best = bestReading(candidates, letters, votes);

  if (best) {
    return { ...base, initials: best.initials, team: best.team, ok: true };
  }

  // No reading fits (GCPSG for Gonçalo Ramos): a known abbreviation of the team at the end still
  // splits it.
  const known =
    votes && kind === "single" ? longestKnownEnding(votes, letters) : undefined;

  if (known) {
    return {
      ...base,
      initials: letters.slice(0, letters.length - known.length),
      team: known,
      ok: true,
      irregular: true,
    };
  }

  return { ...base, initials: null, team: null, ok: false };
}
