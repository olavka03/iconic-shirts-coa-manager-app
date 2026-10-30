export const DEFAULT_PROXY_PATH = "/proxy/verify";

const RESERVED_PARAMETERS = new Set([
  "shop",
  "logged_in_customer_id",
  "path_prefix",
  "timestamp",
  "signature",
]);

export function parseExtraParameters(
  entries: readonly string[],
): Record<string, string> | null {
  const parameters = new Map<string, string>();

  for (const entry of entries) {
    const separatorIndex = entry.indexOf("=");

    if (separatorIndex < 1) {
      return null;
    }

    parameters.set(
      entry.slice(0, separatorIndex),
      entry.slice(separatorIndex + 1),
    );
  }

  return Object.fromEntries(parameters);
}

export function proxySignParameters(options: {
  path: string;
  code: string | undefined;
  shop: string;
  extra: Record<string, string>;
  timestamp: number;
}): Record<string, string> | null {
  const { path, code, shop, extra, timestamp } = options;
  const isVerifyPath = path === DEFAULT_PROXY_PATH;
  const extraKeys = Object.keys(extra);

  if (isVerifyPath && !code) {
    return null;
  }

  if (
    extraKeys.some(
      (key) => RESERVED_PARAMETERS.has(key) || (isVerifyPath && key === "code"),
    )
  ) {
    return null;
  }

  return {
    ...(isVerifyPath && code ? { code } : {}),
    ...extra,
    shop,
    logged_in_customer_id: "",
    path_prefix: "/apps/coa",
    timestamp: String(timestamp),
  };
}
