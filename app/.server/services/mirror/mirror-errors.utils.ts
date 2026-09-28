import {
  isAdminApiError,
  type AdminApiErrorKind,
  type GatewayFailure,
} from "~/.server/gateways/admin-graphql.gateway";
import { errorName } from "~/.server/logging/logger.service";

export type StopKind = "auth" | "access_denied";

type FailureKind = AdminApiErrorKind | "user_error" | "http" | "internal";

const SYNC_ERROR_MAX = 1000;

export class MirrorError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "MirrorError";
    this.code = code;
  }
}

export function throwIfFailed<Result extends { ok: true } | GatewayFailure>(
  result: Result,
): asserts result is Extract<Result, { ok: true }> {
  if (!result.ok) {
    throw new MirrorError(result.code, result.message);
  }
}

export function describeFailure(error: unknown): {
  kind: FailureKind;
  code: string | null;
  message: string;
} {
  if (isAdminApiError(error)) {
    const status = error.status === undefined ? null : String(error.status);

    return {
      kind: error.kind,
      code: error.code ?? status,
      message: error.message,
    };
  }

  if (error instanceof MirrorError) {
    return { kind: "user_error", code: error.code, message: error.message };
  }

  if (error instanceof Response) {
    return {
      kind: "http",
      code: String(error.status),
      message: `HTTP ${error.status}`,
    };
  }

  return {
    kind: "internal",
    code: errorName(error),
    message: error instanceof Error ? error.message : String(error),
  };
}

export function formatSyncError(error: unknown): string {
  const { kind, code, message } = describeFailure(error);

  return `${kind}:${code ?? "-"}: ${message}`.slice(0, SYNC_ERROR_MAX);
}

export const stopKind = (error: unknown): StopKind | null =>
  isAdminApiError(error) &&
  (error.kind === "auth" || error.kind === "access_denied")
    ? error.kind
    : null;
