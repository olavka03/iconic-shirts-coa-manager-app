import { errorName, log } from "~/.server/logging/logger.service";
import { authenticate } from "~/.server/shopify/shopify-app.config";

export async function checkProxySignature(request: Request): Promise<void> {
  try {
    await authenticate.public.appProxy(request);
  } catch (error) {
    // Only a 400 means a bad or stale signature. Anything else comes from the offline token refresh
    // after the signature passed, and the lookup needs Postgres only.
    if (error instanceof Response && error.status === 400) {
      throw error;
    }

    log.warn("proxy.session_unavailable", { kind: errorName(error) });
  }
}
