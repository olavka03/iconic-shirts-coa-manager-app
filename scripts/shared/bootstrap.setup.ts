// .env has no SHOPIFY_APP_URL (the Shopify CLI injects it into `shopify app dev`) and shopifyApp()
// refuses an empty appUrl. Scripts never serve requests, so any valid URL will do.
process.env.SHOPIFY_APP_URL ||= "https://localhost";
