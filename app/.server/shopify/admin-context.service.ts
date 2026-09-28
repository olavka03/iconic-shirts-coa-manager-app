import type { AdminContext } from "~/.server/gateways/admin-graphql.gateway";
import { authenticate } from "./shopify-app.config";

export async function adminContextOf(request: Request): Promise<AdminContext> {
  const { admin, session } = await authenticate.admin(request);

  return { shop: session.shop, admin };
}
