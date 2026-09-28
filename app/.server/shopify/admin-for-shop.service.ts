import {
  HttpRequestError,
  HttpResponseError,
  InvalidJwtError,
} from "@shopify/shopify-api";
import { SessionNotFoundError } from "@shopify/shopify-app-react-router/server";
import type { AdminContext } from "~/.server/gateways/admin-graphql.gateway";
import { unauthenticated } from "./shopify-app.config";

export type AdminForShop = (shop: string) => Promise<AdminContext>;
export type AdminForShopFailure = "no_session" | "retry" | "reauth" | "fatal";

export const adminForShop: AdminForShop = async (shop) => {
  const { admin } = await unauthenticated.admin(shop);

  return { shop, admin };
};

// unauthenticated.admin refreshes an expiring offline token itself. The refresh rethrows only
// InvalidJwtError and a rejected subject token, and turns every other failure into a Response(500).
export function classifyAdminForShopError(error: unknown): AdminForShopFailure {
  if (error instanceof SessionNotFoundError) {
    return "no_session";
  }

  if (error instanceof InvalidJwtError || isRejectedSubjectToken(error)) {
    return "reauth";
  }

  if (error instanceof Response) {
    return error.status >= 500 ? "retry" : "fatal";
  }

  if (error instanceof HttpRequestError || isFetchFailure(error)) {
    return "retry";
  }

  return "fatal";
}

function isRejectedSubjectToken(error: unknown): boolean {
  return (
    error instanceof HttpResponseError &&
    error.response.body?.error === "invalid_subject_token"
  );
}

// Node's fetch rejects with this TypeError when no response arrived; any other TypeError is a bug.
function isFetchFailure(error: unknown): boolean {
  return error instanceof TypeError && error.message === "fetch failed";
}
