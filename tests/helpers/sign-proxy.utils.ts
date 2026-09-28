import { signedProxyQuery } from "../../scripts/shared/proxy-signature.utils";
import { SHOP } from "./certificate-row.factory";

let requestCount = 0;

// The route limits lookups per client address, so a request gets an address of its own
// unless the test names one.
function nextClientAddress(): string {
  requestCount += 1;

  return `2001:db8::${requestCount.toString(16)}`;
}

export function signedProxyRequest(options: {
  code: string;
  shop?: string;
  timestamp?: number;
  tamper?: Partial<Record<string, string>>;
  clientAddress?: string;
}): Request {
  const query = signedProxyQuery(
    {
      code: options.code,
      shop: options.shop ?? SHOP,
      logged_in_customer_id: "",
      path_prefix: "/apps/coa",
      timestamp: String(options.timestamp ?? Math.floor(Date.now() / 1000)),
    },
    process.env.SHOPIFY_API_SECRET ?? "",
  );

  for (const [key, value] of Object.entries(options.tamper ?? {})) {
    if (value !== undefined) {
      query.set(key, value);
    }
  }

  return new Request(`${process.env.SHOPIFY_APP_URL}/proxy/verify?${query}`, {
    headers: {
      "X-Forwarded-For": options.clientAddress ?? nextClientAddress(),
    },
  });
}
