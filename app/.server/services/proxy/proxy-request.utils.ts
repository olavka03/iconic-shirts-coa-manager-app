import { jsonResponse } from "~/.server/services/shared/json-response.utils";

export function clientAddress(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  );
}

export function proxyJsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return jsonResponse(body, status, {
    "X-Robots-Tag": "noindex",
    ...extraHeaders,
  });
}
