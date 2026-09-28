// Certificate code generator (spec §4.3.1). Pure and isomorphic: the server learns a TeamDictionary from the
// shop's certificates and the browser composes suggestions from it. Nothing store-specific is a constant here.
import type {
  CodeHistoryItem,
  CodeInput,
  CodeParts,
  CodeSuggestion,
  Season,
  TeamDictionary,
} from "~/features/codes/types/code-generator.types";
import { orderToken } from "~/features/orders/utils/orders.utils";
import { cleanText } from "~/shared/utils/text.utils";
import { CODE_MAX, parseCode } from "./code.utils";
import { isSegmented, segmentSuffix } from "./code-segments.utils";
import { lookup } from "./code-text.utils";
import {
  classifySeason,
  extractSeason,
  formatSeason,
  READABLE_SEASON,
} from "./season.utils";
import { signerInitials, signerKey, signerKind } from "./signer-initials.utils";
import {
  seriesKey,
  seriesKeys,
  type SeriesEntry,
} from "./team-dictionary.utils";
import {
  extractTeam,
  fallbackTeamAbbreviation,
  itemTypeLetters,
  resolveTeamKey,
} from "./team-names.utils";

type SuggestionParts = Pick<CodeParts, "initials" | "team" | "season"> &
  Pick<CodeSuggestion, "source" | "confidence">;

function partsFromSeries(
  [initials, team, stored]: SeriesEntry,
  season: Season | null,
): SuggestionParts {
  const readable =
    stored !== "" && READABLE_SEASON.has(classifySeason(stored, season));

  return {
    initials,
    team,
    season: readable ? stored : formatSeason(season),
    source: "series",
    confidence: "high",
  };
}

function composeParts(
  names: string[],
  item: string,
  season: Season | null,
  dictionary: TeamDictionary,
): SuggestionParts {
  const kind = signerKind(names);
  const key = resolveTeamKey(extractTeam(item, names)?.key ?? "", dictionary);
  const initialsOf = (name: string) =>
    lookup(dictionary.signers, signerKey(name)) ?? signerInitials(name);
  const learned =
    kind === "group"
      ? (lookup(dictionary.groupTeams, key) ?? lookup(dictionary.teams, key))
      : lookup(dictionary.teams, key);
  const usesFallbackTeam = learned == null;

  return {
    initials:
      kind === "single" || kind === "pair"
        ? names.map(initialsOf).join("")
        : "",
    team:
      learned ??
      (key ? fallbackTeamAbbreviation(key) : itemTypeLetters(item, names)),
    season: formatSeason(season),
    source: "composed",
    confidence:
      usesFallbackTeam || kind === "group" || kind === "none"
        ? "low"
        : "medium",
  };
}

function rememberedSeries(
  input: CodeInput,
  names: string[],
  dictionary: TeamDictionary,
): SeriesEntry | undefined {
  const byItem = { item: input.item, signerNames: names };

  return (
    lookup(
      dictionary.series,
      seriesKey({ ...byItem, productId: input.productId }),
    ) ??
    (input.productId ? lookup(dictionary.series, seriesKey(byItem)) : undefined)
  );
}

export function suggestCode(
  input: CodeInput,
  dictionary: TeamDictionary,
): CodeSuggestion | null {
  const order = orderToken(input.orderName);

  if (!order) {
    return null;
  }

  const prefix = input.codePrefix ?? dictionary.prefix;
  const names = input.signerNames.map(cleanText).filter(Boolean);
  const season = extractSeason(input.item);
  const seriesEntry = rememberedSeries(input, names, dictionary);
  const {
    initials,
    team,
    season: seasonPart,
    source,
    confidence,
  } = seriesEntry
    ? partsFromSeries(seriesEntry, season)
    : composeParts(names, input.item, season, dictionary);
  const code = (prefix + order + initials + team + seasonPart)
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, CODE_MAX);

  return {
    code,
    parts: { prefix, order, initials, team, season: seasonPart },
    source,
    confidence,
  };
}

// Decision 14: the natural code, then the code plus its season (only while the letters after the
// order end without digits), then base-2 … base-99; null when all are taken.
export function resolveCollision(
  code: string,
  taken: ReadonlySet<string>,
  season?: string,
): string | null {
  if (!taken.has(code)) {
    return code;
  }

  const seasoned =
    season && !/\d$/.test(code.replace(/^[A-Z]*\d+/, ""))
      ? code + season
      : null;
  const fits = seasoned !== null && seasoned.length <= CODE_MAX;

  if (fits && !taken.has(seasoned)) {
    return seasoned;
  }

  const base = fits ? seasoned : code;

  for (let collisionNumber = 2; collisionNumber < 100; collisionNumber++) {
    const tail = `-${collisionNumber}`;
    const candidate = base.slice(0, CODE_MAX - tail.length) + tail;

    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

// Duplicating a certificate: its letters become the newest product memory under its keys.
export function withSeriesHint(
  dictionary: TeamDictionary,
  source: CodeHistoryItem,
): TeamDictionary {
  const parsed = parseCode(source.code, source.orderName);

  if (!parsed || !parsed.suffix) {
    return dictionary;
  }

  const votes = new Map(
    Object.entries(dictionary.teams).map(([key, team]) => [
      key,
      new Map([[team, { count: 1 }]]),
    ]),
  );
  const segments = segmentSuffix(
    parsed.suffix,
    source.signerNames,
    source.item,
    votes,
  );

  if (!isSegmented(segments)) {
    return dictionary;
  }

  const entry: SeriesEntry = [
    segments.initials,
    segments.team,
    segments.season,
  ];
  const keys = seriesKeys(source);
  const rest = Object.entries(dictionary.series).filter(
    ([key]) => !keys.includes(key),
  );

  return {
    ...dictionary,
    series: {
      ...Object.fromEntries(keys.map((key) => [key, entry])),
      ...Object.fromEntries(rest),
    },
  };
}

export function retargetCode(
  code: string,
  prefix: string,
  fromOrderName: string,
  toOrderName: string,
): string {
  const from = orderToken(fromOrderName);
  const to = orderToken(toOrderName);

  if (!from || !to || !code.startsWith(prefix + from)) {
    return code;
  }

  return (prefix + to + code.slice(prefix.length + from.length)).slice(
    0,
    CODE_MAX,
  );
}
