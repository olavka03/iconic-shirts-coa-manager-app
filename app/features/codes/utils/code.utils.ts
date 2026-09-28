import { orderToken } from "~/features/orders/utils/orders.utils";

export const CODE_MIN = 4;
export const CODE_MAX = 32;
export const RAW_CODE_MAX = 64;
export const CODE_PATTERN = /^[A-Z0-9]+(-[A-Z0-9]+)*$/;

export function normalizeCode(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, "")
    .toUpperCase();
}

export function normalizeRawCode(raw: string): string {
  return normalizeCode(raw.slice(0, RAW_CODE_MAX));
}

export function codeError(code: string): string | null {
  if (code === "") {
    return "Enter a certificate code.";
  }

  if (!CODE_PATTERN.test(code)) {
    return "Use only letters, numbers, and hyphens.";
  }

  if (code.length < CODE_MIN || code.length > CODE_MAX) {
    return `Use between ${CODE_MIN} and ${CODE_MAX} characters.`;
  }

  return null;
}

export const codeToHandle = (code: string) => code.toLowerCase();
export const handleToCode = (handle: string) => handle.toUpperCase();

export type ParsedCode = {
  prefix: string;
  number: string;
  suffix: string;
  collision: number | null;
};

export function parseCode(
  code: string,
  orderName?: string | null,
): ParsedCode | null {
  const parts = splitCode(code.toUpperCase(), orderName);

  if (parts === null) {
    return null;
  }

  const rest = parts.rest.replace(/^-/, "");
  const marker = /^(.*?)-(\d{1,2})$/.exec(rest);

  return {
    prefix: parts.prefix,
    number: parts.number,
    suffix: (marker ? marker[1] : rest).replace(/-/g, ""),
    collision: marker ? Number(marker[2]) : null,
  };
}

export function codePrefixFor(
  code: string,
  orderName: string | null | undefined,
  fallbackPrefix: string,
): string {
  return parseCode(code, orderName)?.prefix ?? fallbackPrefix;
}

function splitCode(
  code: string,
  orderName: string | null | undefined,
): { prefix: string; number: string; rest: string } | null {
  const token = orderToken(orderName);
  const tokenIndex = token === null ? -1 : code.indexOf(token);

  if (token !== null && tokenIndex >= 0) {
    return {
      prefix: code.slice(0, tokenIndex),
      number: token,
      rest: code.slice(tokenIndex + token.length),
    };
  }

  const lettersThenDigits = /^([A-Z]+)(\d+)(.*)$/.exec(code);

  return lettersThenDigits
    ? {
        prefix: lettersThenDigits[1],
        number: lettersThenDigits[2],
        rest: lettersThenDigits[3],
      }
    : null;
}
