import { orderToken } from "~/features/orders/utils/orders.utils";

// Letters NFKD leaves whole.
const LETTER_FOLDS: Record<string, string> = {
  ø: "o",
  æ: "ae",
  ß: "ss",
  ł: "l",
  đ: "d",
  ı: "i",
  œ: "oe",
};

export function foldText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[øæßłđıœ]/g, (letter) => LETTER_FOLDS[letter] ?? letter);
}

// Letters and digits of the folded order name, for search only: 1001-A → 1001a. Not the order token.
function compact(text: string): string {
  return foldText(text).replace(/[^a-z0-9]/g, "");
}

export function buildSearchText(certificate: {
  code: string;
  item: string;
  orderName: string | null;
  signerNames: string[];
}): string {
  const orderName = certificate.orderName ?? "";
  const parts = [
    certificate.code,
    certificate.code.replace(/-/g, ""),
    certificate.item,
    orderName,
    compact(orderName),
    orderToken(orderName) ?? "",
    ...certificate.signerNames,
  ];

  return parts
    .map((part) =>
      foldText(part)
        .replace(/[^a-z0-9]+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join(" ");
}

// Tokens hold only [a-z0-9], so LIKE wildcards and backslashes never reach the query.
export function searchTokens(query: string): string[] {
  return foldText(query.slice(0, 100))
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .slice(0, 8);
}
