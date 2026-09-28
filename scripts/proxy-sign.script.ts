import "./shared/bootstrap.setup";
import { parseArgs } from "node:util";
import { signedProxyQuery } from "./shared/proxy-signature.utils";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    shop: {
      type: "string",
      default: "test-1-111111111111111156.myshopify.com",
    },
    base: { type: "string", default: "http://localhost:3001" },
  },
});
const [code] = positionals;
const secret = process.env.SHOPIFY_API_SECRET;

if (!code || !secret) {
  console.error(
    "Usage: npm run proxy:sign -- <code> [--shop <domain>] [--base <url>]. SHOPIFY_API_SECRET must be set in .env.",
  );
  process.exit(1);
}

const parameters = {
  code,
  shop: values.shop,
  logged_in_customer_id: "",
  path_prefix: "/apps/coa",
  timestamp: String(Math.floor(Date.now() / 1000)),
};

console.log(
  `${values.base}/proxy/verify?${signedProxyQuery(parameters, secret)}`,
);
console.error("The link works for 90 seconds.");
