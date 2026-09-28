// NFKD leaves these letters whole, so fold spells them out.
const UNDECOMPOSED_LETTERS = new Map(
  Object.entries({
    ø: "o",
    Ø: "O",
    ł: "l",
    Ł: "L",
    ß: "ss",
    æ: "ae",
    Æ: "AE",
    đ: "d",
    Đ: "D",
    ı: "i",
    œ: "oe",
    Œ: "OE",
    þ: "th",
    Þ: "TH",
  }),
);

export function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(
      /[øØłŁßæÆđĐıœŒþÞ]/g,
      (letter) => UNDECOMPOSED_LETTERS.get(letter) ?? letter,
    );
}

// Dictionary keys come from shop data and can name Object.prototype members ("constructor"). The
// dictionary reaches the browser as plain JSON, so every read checks own keys instead.
export function lookup<Value>(
  table: Readonly<Record<string, Value>>,
  key: string,
): Value | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

export const lowercaseLetters = (text: string) =>
  fold(text)
    .toLowerCase()
    .replace(/[^a-z]/g, "");

export const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
