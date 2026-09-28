import type { AdminOperations, ReturnData } from "@shopify/admin-api-client";
import {
  GraphqlQueryError,
  HttpRequestError,
  HttpResponseError,
  InvalidJwtError,
} from "@shopify/shopify-api";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

export type AdminClient = Pick<AdminApiContext, "graphql">;
export type AdminContext = { shop: string; admin: AdminClient };
export type AdminGraphqlOptions = {
  signal?: AbortSignal;
  pace?: boolean;
  maxThrottleRetries?: number;
};
export type AdminApiErrorKind =
  | "throttled"
  | "access_denied"
  | "auth"
  | "http"
  | "network"
  | "timeout"
  | "graphql";
export type GatewayFailure = {
  ok: false;
  code: string;
  message: string;
  field?: string[];
  elementKey?: string;
};

type UserError = {
  code?: string | null;
  field?: string[] | null;
  elementKey?: string | null;
  message: string;
};
type AccessDeniedReason = "scope" | "customer_data";
type ThrottleStatus = {
  maximumAvailable: number;
  currentlyAvailable: number;
  restoreRate: number;
};
type Cost = { requestedQueryCost?: number; throttleStatus?: ThrottleStatus };
type AdminApiErrorDetails = {
  reason?: AccessDeniedReason;
  status?: number;
  code?: string;
  response?: Response;
  cost?: Cost;
};
type GraphqlErrorBody = {
  errors?: {
    graphQLErrors?: { message?: string; extensions?: { code?: string } }[];
  };
  extensions?: { cost?: Cost };
};

export class AdminApiError extends Error {
  readonly kind: AdminApiErrorKind;
  readonly reason?: AccessDeniedReason;
  readonly status?: number;
  readonly code?: string;
  readonly response?: Response;
  readonly cost?: Cost;

  constructor(
    kind: AdminApiErrorKind,
    message: string,
    details: AdminApiErrorDetails = {},
  ) {
    super(message);
    this.name = "AdminApiError";
    this.kind = kind;
    this.reason = details.reason;
    this.status = details.status;
    this.code = details.code;
    this.response = details.response;
    this.cost = details.cost;
  }
}

export function isAdminApiError(error: unknown): error is AdminApiError {
  return error instanceof AdminApiError;
}

export function failureFromUserError(userError: UserError): GatewayFailure {
  return {
    ok: false,
    code: userError.code ?? "UNKNOWN",
    field: userError.field ?? undefined,
    elementKey: userError.elementKey ?? undefined,
    message: userError.message,
  };
}

export function noResult(operation: string): GatewayFailure {
  return {
    ok: false,
    code: "UNKNOWN",
    message: `${operation} returned no result.`,
  };
}

// Protected customer data refusals: "This app is not approved to access the Order object",
// "... not approved to use the email field".
const NOT_APPROVED = /not approved to (access|use)/i;

function fromGraphqlQueryError(error: GraphqlQueryError): AdminApiError {
  const body = (error.body ?? {}) as GraphqlErrorBody;
  const errors = body.errors?.graphQLErrors ?? [];
  const codes = errors
    .map((graphqlError) => graphqlError.extensions?.code)
    .filter((code): code is string => typeof code === "string");
  const message =
    errors
      .map((graphqlError) => graphqlError.message)
      .filter(Boolean)
      .join("; ") || error.message;

  if (codes.includes("THROTTLED")) {
    return new AdminApiError("throttled", message, {
      code: "THROTTLED",
      cost: body.extensions?.cost,
    });
  }

  if (NOT_APPROVED.test(message)) {
    return new AdminApiError("access_denied", message, {
      reason: "customer_data",
      code: codes[0] ?? "ACCESS_DENIED",
    });
  }

  if (codes.includes("ACCESS_DENIED")) {
    return new AdminApiError("access_denied", message, {
      reason: "scope",
      code: "ACCESS_DENIED",
    });
  }

  return new AdminApiError("graphql", message, { code: codes[0] });
}

function timedOut(): AdminApiError {
  return new AdminApiError("timeout", "The request timed out.");
}

function kindForStatus(status: number): AdminApiErrorKind {
  if (status === 401 || status === 403) {
    return "auth";
  }

  return status === 429 ? "throttled" : "http";
}

export function toAdminApiError(
  error: unknown,
  signal?: AbortSignal,
): AdminApiError {
  if (error instanceof AdminApiError) {
    return error;
  }

  if (error instanceof GraphqlQueryError) {
    return fromGraphqlQueryError(error);
  }

  // In embedded contexts handleClientError re-throws every HttpResponseError as a Response.
  if (error instanceof Response) {
    return new AdminApiError(
      kindForStatus(error.status),
      `HTTP ${error.status}`,
      {
        status: error.status,
        response: error,
      },
    );
  }

  if (error instanceof HttpResponseError) {
    return new AdminApiError(
      kindForStatus(error.response.code),
      error.message,
      {
        status: error.response.code,
      },
    );
  }

  if (error instanceof InvalidJwtError) {
    return new AdminApiError("auth", error.message);
  }

  const name =
    typeof error === "object" && error !== null && "name" in error
      ? error.name
      : undefined;

  if (signal?.aborted || name === "AbortError" || name === "TimeoutError") {
    return timedOut();
  }

  if (error instanceof HttpRequestError || error instanceof TypeError) {
    return new AdminApiError("network", error.message);
  }

  return new AdminApiError(
    "graphql",
    error instanceof Error ? error.message : String(error),
  );
}

type Sleep = (durationMs: number, signal?: AbortSignal) => Promise<void>;

let sleepOverride: Sleep | null = null;

export function setSleepForTests(replacement: Sleep | null): void {
  sleepOverride = replacement;
}

function sleep(durationMs: number, signal?: AbortSignal): Promise<void> {
  if (sleepOverride) {
    return sleepOverride(durationMs, signal);
  }

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(timedOut());

      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      reject(timedOut());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, durationMs);

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function throttleWaitMs(cost: Cost | undefined): number {
  const status = cost?.throttleStatus;

  if (!status) {
    return 1000;
  }

  const missing = (cost?.requestedQueryCost ?? 100) - status.currentlyAvailable;
  const seconds = missing / Math.max(status.restoreRate, 1);

  return Math.max(1000, Math.ceil(seconds * 1000));
}

// About 100 points covers the next few mutations (11–12 points each).
const PACE_FLOOR = 100;

function paceWaitMs(status: ThrottleStatus | undefined): number {
  if (!status || status.currentlyAvailable >= PACE_FLOOR) {
    return 0;
  }

  const seconds =
    (PACE_FLOOR - status.currentlyAvailable) / Math.max(status.restoreRate, 1);

  return Math.ceil(seconds * 1000);
}

// The only caller of admin.graphql in the app (tests/guards/no-customer-data.test.ts).
export async function adminGraphql<Operation extends keyof AdminOperations>(
  admin: AdminClient,
  operation: Operation,
  variables?: AdminOperations[Operation]["variables"],
  options: AdminGraphqlOptions = {},
): Promise<ReturnData<Operation, AdminOperations>> {
  const maxRetries = options.maxThrottleRetries ?? 5;

  for (let attempt = 0; ; attempt++) {
    try {
      const response = await admin.graphql(operation, {
        variables,
        signal: options.signal,
      } as never);
      const body = (await response.json()) as {
        data: ReturnData<Operation, AdminOperations>;
        extensions?: { cost?: Cost };
      };
      const wait = options.pace
        ? paceWaitMs(body.extensions?.cost?.throttleStatus)
        : 0;

      if (wait > 0) {
        await sleep(wait, options.signal);
      }

      return body.data;
    } catch (error) {
      const adminError = toAdminApiError(error, options.signal);

      if (
        adminError.kind !== "throttled" ||
        attempt >= maxRetries ||
        options.signal?.aborted
      ) {
        throw adminError;
      }

      await sleep(throttleWaitMs(adminError.cost), options.signal);
    }
  }
}
