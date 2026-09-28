import type { TeamDictionary } from "~/features/codes/types/code-generator.types";
import { cleanText } from "~/shared/utils/text.utils";
import {
  escapeRegExp,
  fold,
  lookup,
  lowercaseLetters,
} from "./code-text.utils";
import { signerKey } from "./signer-initials.utils";

const STOP_WORDS = new Set(
  (
    "home away third fourth retro original orginal football shirt shirts jersey kit goalkeeper goalkeepers gk player " +
    "issue match worn tribute commemorative champions league cl world cup euro final edition team squad signed autographed multi dual " +
    "triple double frame framed photo photograph boot boots glove gloves display ball special centenary training top winners winner " +
    "and with shorts limited legends anniversary"
  ).split(" "),
);
const LEADING_SKIP_WORDS = new Set(
  "original orginal retro signed autographed authentic official vintage classic the rare genuine framed".split(
    " ",
  ),
);
const CLUB_WORDS = new Set(
  "fc afc cf sc ssc ac as cd bv sv fk sk club calcio de del da the".split(" "),
);

function endsTeamName(token: string): boolean {
  const letters = lowercaseLetters(token);

  return (
    /^[-–—|:(]/.test(token) ||
    /\d/.test(token) ||
    !letters ||
    STOP_WORDS.has(letters)
  );
}

function leadingTeam(text: string): string | null {
  const tokens = cleanText(text)
    .replace(/^[\s\-–—:|,]+/, "")
    .split(" ")
    .filter(Boolean);
  const start = tokens.findIndex(
    (token) => !LEADING_SKIP_WORDS.has(lowercaseLetters(token)),
  );
  const teamWords: string[] = [];

  for (const token of start < 0 ? [] : tokens.slice(start)) {
    if (endsTeamName(token)) {
      break;
    }

    teamWords.push(token.replace(/[,;:]+$/, ""));

    if (/[,;:]$/.test(token)) {
      break;
    }
  }

  return teamWords.length > 0 ? teamWords.join(" ") : null;
}

export function extractTeam(
  item: string,
  signerNames: readonly string[] = [],
): { name: string; key: string } | null {
  const text = cleanText(item);

  if (!text) {
    return null;
  }

  // The words after "Signed" describe the shirt, so they are tried first; the words before it
  // usually name the signer.
  const signedMatch = /^(.*?)\b(?:signed|autographed)\b(.*)$/i.exec(text);
  const parts = signedMatch ? [signedMatch[2], signedMatch[1]] : [text];
  const people = new Set(signerNames.map(signerKey));
  const name = parts
    .map(leadingTeam)
    .find(
      (candidate): candidate is string =>
        !!candidate && !people.has(signerKey(candidate)),
    );

  return name === undefined ? null : { name, key: teamKey(name) };
}

export function teamKey(name: string): string {
  const words = fold(name)
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
  const core = words.filter((word) => !CLUB_WORDS.has(word));

  return (core.length > 0 ? core : words).join(" ");
}

export const acronym = (key: string) =>
  key
    .split(" ")
    .map((word) => word[0])
    .join("");

export function fallbackTeamAbbreviation(key: string): string {
  return acronym(key).toUpperCase();
}

// For items without a team (boots, gloves): initials of up to three item words.
export function itemTypeLetters(
  item: string,
  signerNames: readonly string[] = [],
): string {
  const text = signerNames.reduce(
    (remaining, signerName) =>
      remaining.replace(new RegExp(escapeRegExp(signerName), "i"), " "),
    cleanText(item),
  );
  const words = fold(text)
    .replace(/\b(signed|autographed)\b/gi, " ")
    .split(/[\s\-–—]+/)
    .filter((word) => /^[A-Za-z]/.test(word));

  return words
    .slice(0, 3)
    .map((word) => word[0].toUpperCase())
    .join("");
}

function editDistanceAtMost1(first: string, second: string): boolean {
  if (first === second) {
    return true;
  }

  if (Math.abs(first.length - second.length) > 1) {
    return false;
  }

  let firstIndex = 0;
  let secondIndex = 0;
  let edits = 0;

  while (firstIndex < first.length && secondIndex < second.length) {
    if (first[firstIndex] === second[secondIndex]) {
      firstIndex++;
      secondIndex++;
      continue;
    }

    edits++;

    if (edits > 1) {
      return false;
    }

    if (first.length > second.length) {
      firstIndex++;
    } else if (second.length > first.length) {
      secondIndex++;
    } else {
      firstIndex++;
      secondIndex++;
    }
  }

  return (
    edits + (first.length - firstIndex) + (second.length - secondIndex) <= 1
  );
}

const isStoredTeam = (key: string, dictionary: TeamDictionary) =>
  lookup(dictionary.teams, key) != null ||
  lookup(dictionary.groupTeams, key) != null;

// A key of 6+ letters also resolves to the one known key a single edit away (galatasaray → the stored
// galatasary); shorter keys are too close to each other for that.
export function resolveTeamKey(
  key: string,
  dictionary: TeamDictionary,
): string {
  if (!key) {
    return "";
  }

  const alias = lookup(dictionary.aliases, key);

  if (alias) {
    return alias;
  }

  if (isStoredTeam(key, dictionary)) {
    return key;
  }

  if (key.replace(/ /g, "").length < 6) {
    return key;
  }

  const known = new Set([
    ...Object.keys(dictionary.teams),
    ...Object.keys(dictionary.groupTeams),
  ]);
  const near = [...known].filter((knownKey) =>
    editDistanceAtMost1(knownKey, key),
  );

  return near.length === 1 ? near[0] : key;
}

export function isKnownTeam(name: string, dictionary: TeamDictionary): boolean {
  return isStoredTeam(resolveTeamKey(teamKey(name), dictionary), dictionary);
}
