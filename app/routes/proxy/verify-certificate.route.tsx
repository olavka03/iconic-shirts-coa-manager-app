import { codeError, normalizeRawCode } from "~/features/codes/utils/code.utils";
import {
  toVerificationPayload,
  type VerifyResponse,
} from "~/features/certificates/utils/verification.utils";
import { log } from "~/.server/logging/logger.service";
import { getVerificationSource } from "~/.server/repositories/certificate.repository";
import { createFixedWindowLimiter } from "~/.server/services/proxy/fixed-window-limiter.utils";
import {
  clientAddress,
  proxyJsonResponse,
} from "~/.server/services/proxy/proxy-request.utils";
import { checkProxySignature } from "~/.server/shopify/app-proxy-signature.service";
import type { Route } from "./+types/verify-certificate.route";

const limiter = createFixedWindowLimiter({
  limit: 20,
  windowMs: 60_000,
  maxKeys: 10_000,
});

function verifyJsonResponse(
  body: VerifyResponse,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return proxyJsonResponse(body, status, extraHeaders);
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

    return verifyJsonResponse({ found: false, error: "rate_limited" }, 429, {
      "Retry-After": "60",
    });
  }

  const code = normalizeRawCode(url.searchParams.get("code") ?? "");

  if (codeError(code)) {
    return verifyJsonResponse({ found: false });
  }

  const certificate = await getVerificationSource(shop, code);

  return certificate
    ? verifyJsonResponse({
        found: true,
        certificate: toVerificationPayload(certificate),
      })
    : verifyJsonResponse({ found: false });
}
