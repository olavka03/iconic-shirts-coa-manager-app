import "./shared/bootstrap.setup";
import { parseArgs } from "node:util";
import {
  DEFAULT_PROXY_PATH,
  parseExtraParameters,
  proxySignParameters,
} from "./shared/proxy-sign-arguments.utils";
import { signedProxyQuery } from "./shared/proxy-signature.utils";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    shop: {
      type: "string",
      default: "test-1-111111111111111156.myshopify.com",
    },
    base: { type: "string", default: "http://localhost:3001" },
    path: { type: "string", default: DEFAULT_PROXY_PATH },
    param: { type: "string", multiple: true },
  },
});
const [code] = positionals;
const secret = process.env.SHOPIFY_API_SECRET;
const extra = parseExtraParameters(values.param ?? []);
const parameters =
  extra && values.path.startsWith("/proxy/")
    ? proxySignParameters({
        path: values.path,
        code,
        shop: values.shop,
        extra,
        timestamp: Math.floor(Date.now() / 1000),
      })
    : null;

if (!parameters || !secret) {
  console.error(
    `Usage: npm run proxy:sign -- <code> [--path <route>] [--param key=value]... [--shop <domain>] [--base <url>]. The code is required for ${DEFAULT_PROXY_PATH} only; --path must start with /proxy/ and --param can be repeated. SHOPIFY_API_SECRET must be set in .env.`,
  );
  process.exit(1);
}

console.log(
  `${values.base}${values.path}?${signedProxyQuery(parameters, secret)}`,
);
console.error("The link works for 90 seconds.");
