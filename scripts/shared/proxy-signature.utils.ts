import { createHmac } from "node:crypto";

// Shopify's documented app proxy algorithm: sorted "key=value" pairs joined with no separator.
export function proxySignature(
  parameters: Record<string, string>,
  secret: string,
): string {
  const message = Object.entries(parameters)
    .filter(([key]) => key !== "signature")
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("");

  return createHmac("sha256", secret).update(message).digest("hex");
}

export function signedProxyQuery(
  parameters: Record<string, string>,
  secret: string,
): URLSearchParams {
  const query = new URLSearchParams(parameters);
  query.set("signature", proxySignature(parameters, secret));

  return query;
}
