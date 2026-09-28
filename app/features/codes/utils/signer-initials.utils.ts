import type { SignerKind } from "~/features/codes/types/code-generator.types";
import { cleanText } from "~/shared/utils/text.utils";
import { fold } from "./code-text.utils";

const PARTICLES = new Set([
  "van",
  "von",
  "de",
  "di",
  "da",
  "der",
  "den",
  "dos",
  "das",
  "do",
  "del",
  "della",
  "du",
  "la",
  "le",
  "el",
  "al",
  "ter",
  "ten",
  "y",
]);

type InitialsOptions = {
  particles?: "skip-lower" | "keep";
  mononym?: 1 | 2;
  splitHyphen?: boolean;
  words?: "all" | "first-last";
};

function nameWords(name: string, splitHyphen = true): string[] {
  const folded = fold(cleanText(name).replace(/\([^)]*\)/g, " "));

  return folded
    .split(splitHyphen ? /[\s\-‐–]+/ : /\s+/)
    .map((word) => word.replace(/[^A-Za-z]/g, ""))
    .filter(Boolean);
}

// Only lower-case particles are skipped: Marco van Basten → MB, Edwin Van der Sar → EVS.
function withoutParticles(words: string[]): string[] {
  const kept = words.filter(
    (word) =>
      !(PARTICLES.has(word.toLowerCase()) && word[0] === word[0].toLowerCase()),
  );

  return kept.length > 0 ? kept : words;
}

function initialsWith(name: string, options: InitialsOptions = {}): string {
  const {
    particles = "skip-lower",
    mononym = 1,
    splitHyphen = true,
    words = "all",
  } = options;
  const allWords = nameWords(name, splitHyphen);

  if (allWords.length === 0) {
    return "";
  }

  const kept = particles === "keep" ? allWords : withoutParticles(allWords);

  if (kept.length === 1) {
    return kept[0].slice(0, mononym).toUpperCase();
  }

  const used = words === "first-last" ? [kept[0], kept[kept.length - 1]] : kept;

  return used
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

export function signerInitials(name: string): string {
  return initialsWith(name);
}

// Readings of a stored code's initials, in the order segmentSuffix prefers them.
export function initialsVariants(name: string): string[] {
  const words = nameWords(name);
  const variants = [
    initialsWith(name),
    initialsWith(name, { particles: "keep" }),
    initialsWith(name, { splitHyphen: false }),
    initialsWith(name, { words: "first-last" }),
    initialsWith(name, { mononym: 2 }),
    initialsWith(name, { words: "first-last", particles: "keep" }),
    ...(words.length >= 3 ? [(words[0][0] + words[1][0]).toUpperCase()] : []),
  ];

  return [...new Set(variants.filter(Boolean))];
}

export function signerKey(name: string): string {
  return fold(cleanText(name).replace(/\([^)]*\)/g, " "))
    .toLowerCase()
    .replace(/[-‐–]/g, " ")
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const signersKey = (names: readonly string[]) =>
  names.map(signerKey).filter(Boolean).sort().join("+");

const isEntitySigner = (name: string) =>
  /\d|\b(squad|team|players|legends|xi)\b/i.test(name);

export function signerKind(names: readonly string[]): SignerKind {
  if (names.length === 1 && isEntitySigner(names[0])) {
    return "group";
  }

  if (names.length === 0) {
    return "none";
  }

  if (names.length === 1) {
    return "single";
  }

  return names.length === 2 ? "pair" : "group";
}
