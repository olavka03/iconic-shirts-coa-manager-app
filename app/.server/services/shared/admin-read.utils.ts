import { isAdminApiError } from "~/.server/gateways/admin-graphql.gateway";
import { errorName } from "~/.server/logging/logger.service";

export const ADMIN_READ_BUDGET_MS = 3_000;
export const REQUEST_BUDGET_MS = 8_000;
export const JOB_ITEM_BUDGET_MS = 30_000;

export function budgetSignal(
  milliseconds: number,
  signal?: AbortSignal,
): AbortSignal {
  const timeout = AbortSignal.timeout(milliseconds);

  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

// An expired session must reach the route as its Response, so App Bridge can retry.
export function rethrowAuth(error: unknown): void {
  if (error instanceof Response) {
    throw error;
  }

  if (isAdminApiError(error) && error.kind === "auth") {
    throw error.response ?? error;
  }
}

export function failureKind(error: unknown): string {
  return isAdminApiError(error) ? error.kind : errorName(error);
}
