import { codeError, normalizeRawCode } from "~/features/codes/utils/code.utils";
import {
  toVerificationPayload,
  type VerifyResponse,
} from "~/features/certificates/utils/verification.utils";
import { errorName, log } from "~/.server/logging/logger.service";
import { getVerificationSource } from "~/.server/repositories/certificate.repository";
import { createFixedWindowLimiter } from "~/.server/services/proxy/fixed-window-limiter.utils";
import { jsonResponse } from "~/.server/services/shared/json-response.utils";
import { authenticate } from "~/.server/shopify/shopify-app.config";
import type { Route } from "./+types/verify-certificate.route";

const limiter = createFixedWindowLimiter({
  limit: 20,
  windowMs: 60_000,
  maxKeys: 10_000,
});

function proxyJsonResponse(
  body: VerifyResponse,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return jsonResponse(body, status, {
    "X-Robots-Tag": "noindex",
    ...extraHeaders,
  });
}

async function checkProxySignature(request: Request): Promise<void> {
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

function clientAddress(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  );
}

export async function loader({ request }: Route.LoaderArgs) {
  await checkProxySignature(request);

  const url = new URL(request.url);
  // Covered by the signature, so it is safe to use as the tenant key.
  const shop = url.searchParams.get("shop") ?? "";

  const decision = limiter.allow(`${shop}|${clientAddress(request)}`);

  if (!decision.allowed) {
    if (decision.firstDenial) {
      log.warn("proxy.rate_limited", { shop });
    }

    return proxyJsonResponse({ found: false, error: "rate_limited" }, 429, {
      "Retry-After": "60",
    });
  }

  const code = normalizeRawCode(url.searchParams.get("code") ?? "");

  if (codeError(code)) {
    return proxyJsonResponse({ found: false });
  }

  const certificate = await getVerificationSource(shop, code);

  return certificate
    ? proxyJsonResponse({
        found: true,
        certificate: toVerificationPayload(certificate),
      })
    : proxyJsonResponse({ found: false });
}
