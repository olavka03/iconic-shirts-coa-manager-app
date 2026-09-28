import { embeddedHeaders } from "~/.server/shopify/embedded-headers.utils";
import { authenticate } from "~/.server/shopify/shopify-app.config";
import type { Route } from "./+types/shopify-auth.route";

export const loader = async ({ request }: Route.LoaderArgs) => {
  await authenticate.admin(request);

  return null;
};

export const headers = embeddedHeaders;
