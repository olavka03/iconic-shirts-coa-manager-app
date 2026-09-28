import { data } from "react-router";
import { errorName, log } from "~/.server/logging/logger.service";
import type { SaveResult } from "~/.server/services/certificates/certificate-save.service";
import type { ErrorBody } from "~/shared/types/api.types";

// Never cached: every body is per shop and per request.
export function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

export function unavailable(): Response {
  return jsonResponse(
    { ok: false, formError: "unavailable" } satisfies ErrorBody,
    503,
  );
}

export function invalid(extra: Omit<ErrorBody, "ok"> = {}): Response {
  return jsonResponse({ ok: false, ...extra } satisfies ErrorBody, 422);
}

export function notFoundJson(): Response {
  return jsonResponse(
    { ok: false, formError: "not_found" } satisfies ErrorBody,
    404,
  );
}

export function saveFailureResponse(
  result: Extract<SaveResult, { ok: false }>,
): Response {
  if (result.kind === "validation") {
    return invalid({ fieldErrors: result.fieldErrors });
  }

  return result.kind === "not_found" ? notFoundJson() : unavailable();
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(raw: string): boolean {
  return UUID_PATTERN.test(raw);
}

// Route and query ids are UUIDs; anything else never reaches the database.
export function parseIdParam(raw: string | null | undefined): string | null {
  if (raw == null || !isUuid(raw)) {
    return null;
  }

  return raw.toLowerCase();
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export async function withJsonErrors(
  event: string,
  run: () => Promise<Response>,
): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }

    log.error(event, { error: errorName(error) });

    return unavailable();
  }
}

export function throwNotFound(): never {
  throw data(null, { status: 404 });
}
