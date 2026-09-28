import type {
  CodeHistoryItem,
  DictionaryStrategy,
  TeamDictionary,
} from "~/features/codes/types/code-generator.types";
import { cleanText } from "~/shared/utils/text.utils";
import { parseCode } from "./code.utils";
import {
  isSegmented,
  segmentSuffix,
  type Segments,
} from "./code-segments.utils";
import { fold } from "./code-text.utils";
import { signerInitials, signerKey, signersKey } from "./signer-initials.utils";
import { acronym } from "./team-names.utils";

type Vote = { count: number; newest: number; weight: number };
type Votes = Map<string, Map<string, Vote>>;
export type SeriesEntry = [initials: string, team: string, season: string];
type LearningRow = CodeHistoryItem & { rank: number; suffix: string };
type LearnedMaps = {
  teams: Votes;
  groupTeams: Votes;
  signers: Votes;
  series: Map<string, SeriesEntry>;
};

const itemKey = (item: string) =>
  fold(cleanText(item))
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export const seriesKey = (historyItem: {
  productId?: string | null;
  item: string;
  signerNames: readonly string[];
}) => {
  const subject = historyItem.productId ?? "i:" + itemKey(historyItem.item);

  return `${subject}|${signersKey(historyItem.signerNames)}`;
};

// A certificate with a product is remembered under the product and under its item text.
export const seriesKeys = (historyItem: CodeHistoryItem) =>
  historyItem.productId
    ? [seriesKey(historyItem), seriesKey({ ...historyItem, productId: null })]
    : [seriesKey(historyItem)];

const emptyVote = (): Vote => ({ count: 0, newest: Infinity, weight: 0 });

function vote(
  votes: Votes,
  key: string,
  value: string,
  rank: number,
  halfLife: number,
) {
  if (!key) {
    return;
  }

  const values = votes.get(key) ?? new Map<string, Vote>();
  const tally = values.get(value) ?? emptyVote();

  tally.count++;
  tally.newest = Math.min(tally.newest, rank);
  tally.weight += Math.pow(0.5, rank / halfLife);
  values.set(value, tally);
  votes.set(key, values);
}

function unvote(votes: Votes, key: string, value: string) {
  const values = votes.get(key);
  const tally = values?.get(value);

  if (!values || !tally) {
    return;
  }

  tally.count--;

  if (tally.count <= 0) {
    values.delete(value);
  }
}

function mergeVotes(votes: Votes, from: string, to: string) {
  const sourceValues = votes.get(from);

  if (!sourceValues) {
    return;
  }

  const targetValues = votes.get(to) ?? new Map<string, Vote>();

  for (const [value, sourceTally] of sourceValues) {
    const merged = targetValues.get(value) ?? emptyVote();

    merged.count += sourceTally.count;
    merged.newest = Math.min(merged.newest, sourceTally.newest);
    merged.weight += sourceTally.weight;
    targetValues.set(value, merged);
  }

  votes.set(to, targetValues);
  votes.delete(from);
}

function beats(
  tally: Vote,
  rival: Vote,
  strategy: DictionaryStrategy,
): boolean {
  if (strategy === "recent") {
    return tally.newest < rival.newest;
  }

  const tie = Math.abs(tally.weight - rival.weight) <= 1e-9;

  return (
    tally.weight > rival.weight + 1e-9 || (tie && tally.newest < rival.newest)
  );
}

function winningValue(
  values: Map<string, Vote>,
  strategy: DictionaryStrategy,
): string | null {
  const best = [...values].reduce<[string, Vote] | null>(
    (bestSoFar, entry) =>
      bestSoFar === null || beats(entry[1], bestSoFar[1], strategy)
        ? entry
        : bestSoFar,
    null,
  );

  return best?.[0] ?? null;
}

function winningValues(
  votes: Votes,
  strategy: DictionaryStrategy,
): Record<string, string> {
  return Object.fromEntries(
    [...votes].flatMap(([key, values]) => {
      const value = winningValue(values, strategy);

      return value === null ? [] : [[key, value]];
    }),
  );
}

// "psg" → "paris saint germain": a one-word key of 2–4 letters that spells a multi-word key's initials.
function findAliases(keys: string[]): Record<string, string> {
  return Object.fromEntries(
    keys.flatMap((key) => {
      const short = !key.includes(" ") && key.length >= 2 && key.length <= 4;
      const target = short
        ? keys.find(
            (candidate) =>
              candidate.includes(" ") && acronym(candidate) === key,
          )
        : undefined;

      return target ? [[key, target]] : [];
    }),
  );
}

function withoutDefaultInitials(
  initialsBySigner: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(initialsBySigner).filter(
      ([key, initials]) => initials !== signerInitials(key),
    ),
  );
}

const PREFIX_WINDOW = 50;

function shopInitials(shopName: string): string {
  const words = fold(shopName)
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "";
  }

  const letters =
    words.length === 1
      ? words[0].slice(0, 2)
      : words.map((word) => word[0]).join("");

  return letters.slice(0, 4);
}

export function learnCodePrefix(
  history: readonly Pick<CodeHistoryItem, "code" | "orderName">[],
  shopName: string,
): string {
  const prefixes = history
    .map(
      (historyItem) =>
        parseCode(historyItem.code, historyItem.orderName)?.prefix ?? "",
    )
    .filter(Boolean)
    .slice(0, PREFIX_WINDOW);
  const counts = new Map<string, { count: number; first: number }>();

  prefixes.forEach((prefix, index) => {
    const usage = counts.get(prefix) ?? { count: 0, first: index };

    usage.count++;
    counts.set(prefix, usage);
  });

  const best = [...counts].reduce<
    [string, { count: number; first: number }] | null
  >((bestSoFar, entry) => {
    const [, usage] = entry;
    const wins =
      bestSoFar === null ||
      usage.count > bestSoFar[1].count ||
      (usage.count === bestSoFar[1].count && usage.first < bestSoFar[1].first);

    return wins ? entry : bestSoFar;
  }, null);

  return best ? best[0] : shopInitials(shopName);
}

const learnsTeam = (segments: Segments) =>
  segments.kind === "single" || segments.kind === "pair";

function plainTeamVotes(
  rows: readonly LearningRow[],
  plainSegments: readonly Segments[],
  halfLife: number,
): Votes {
  const votes: Votes = new Map();

  rows.forEach((row, index) => {
    const segments = plainSegments[index];

    if (isSegmented(segments) && learnsTeam(segments)) {
      vote(votes, segments.teamKey, segments.team, row.rank, halfLife);
    }
  });

  return votes;
}

function learnFromRows(
  rows: readonly LearningRow[],
  plainSegments: readonly Segments[],
  plainVotes: Votes,
  halfLife: number,
): LearnedMaps {
  const teams: Votes = new Map();
  const groupTeams: Votes = new Map();
  const signers: Votes = new Map();
  const series = new Map<string, SeriesEntry>();

  rows.forEach((row, index) => {
    const plainReading = plainSegments[index];
    const ownTeamVote =
      isSegmented(plainReading) && learnsTeam(plainReading)
        ? plainReading
        : null;

    // Each row is read with the other rows' team votes, never its own.
    if (ownTeamVote) {
      unvote(plainVotes, ownTeamVote.teamKey, ownTeamVote.team);
    }

    const segments = segmentSuffix(
      row.suffix,
      row.signerNames,
      row.item,
      plainVotes,
    );

    if (ownTeamVote) {
      vote(
        plainVotes,
        ownTeamVote.teamKey,
        ownTeamVote.team,
        row.rank,
        halfLife,
      );
    }

    if (!isSegmented(segments)) {
      return;
    }

    if (segments.teamKey) {
      vote(
        segments.kind === "group" ? groupTeams : teams,
        segments.teamKey,
        segments.team,
        row.rank,
        halfLife,
      );
    }

    if (segments.kind === "single") {
      vote(
        signers,
        signerKey(row.signerNames[0]),
        segments.initials,
        row.rank,
        halfLife,
      );
    }

    for (const key of seriesKeys(row)) {
      if (!series.has(key)) {
        series.set(key, [segments.initials, segments.team, segments.season]);
      }
    }
  });

  return { teams, groupTeams, signers, series };
}

export function buildTeamDictionary(
  history: readonly CodeHistoryItem[],
  options: {
    shopName?: string;
    strategy?: DictionaryStrategy;
    halfLife?: number;
    maxSeries?: number;
  } = {},
): TeamDictionary {
  const {
    strategy = "recent",
    halfLife = 40,
    shopName = "",
    maxSeries = 1000,
  } = options;
  const rows = history.flatMap((historyItem, rank): LearningRow[] => {
    const parsed = parseCode(historyItem.code, historyItem.orderName);

    return parsed && parsed.suffix !== "" && historyItem.signerNames.length > 0
      ? [{ ...historyItem, rank, suffix: parsed.suffix }]
      : [];
  });
  const plainSegments = rows.map((row) =>
    segmentSuffix(row.suffix, row.signerNames, row.item),
  );
  const { teams, groupTeams, signers, series } = learnFromRows(
    rows,
    plainSegments,
    plainTeamVotes(rows, plainSegments, halfLife),
    halfLife,
  );
  const aliases = findAliases([
    ...new Set([...teams.keys(), ...groupTeams.keys()]),
  ]);

  for (const [alias, target] of Object.entries(aliases)) {
    mergeVotes(teams, alias, target);
    mergeVotes(groupTeams, alias, target);
  }

  return {
    version: 1,
    prefix: learnCodePrefix(history, shopName),
    teams: winningValues(teams, strategy),
    groupTeams: winningValues(groupTeams, strategy),
    aliases,
    signers: withoutDefaultInitials(winningValues(signers, strategy)),
    series: Object.fromEntries([...series].slice(0, maxSeries)),
  };
}
