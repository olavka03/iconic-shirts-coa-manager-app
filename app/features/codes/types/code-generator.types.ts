export type Season =
  | { kind: "range"; start: number; end: number; text: string }
  | { kind: "single"; start: number; end: null; text: string };

// History arrays are newest first (createdAt desc, id desc): index 0 is the most recent usage.
export type CodeHistoryItem = {
  code: string;
  item: string;
  signerNames: string[];
  orderName?: string | null;
  productId?: string | null;
};

export type DictionaryStrategy = "recent" | "weighted";

export type TeamDictionary = {
  version: 1;
  prefix: string;
  teams: Record<string, string>;
  groupTeams: Record<string, string>;
  aliases: Record<string, string>;
  signers: Record<string, string>;
  series: Record<string, [initials: string, team: string, season: string]>;
};

export type CodeInput = {
  codePrefix?: string;
  orderName: string;
  signerNames: readonly string[];
  item: string;
  productId?: string | null;
};

export type CodeParts = {
  prefix: string;
  order: string;
  initials: string;
  team: string;
  season: string;
};

export type CodeSuggestion = {
  code: string;
  parts: CodeParts;
  source: "series" | "composed";
  confidence: "high" | "medium" | "low";
};

export type SignerKind = "group" | "pair" | "single" | "none";

export type SeasonForm =
  | "yy+yy"
  | "yy"
  | "y+y"
  | "yyyy"
  | "end-yy"
  | "start-yy"
  | "omitted"
  | "none"
  | "other";
