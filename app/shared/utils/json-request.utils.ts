import { beginLoading } from "./admin-loading.utils";

export type NetworkFailure = {
  ok: false;
  kind: "network" | "server" | "aborted";
};
export type JsonResult<ResponseBody> = ResponseBody | NetworkFailure;
export type RequestJsonInit = {
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
  loading?: boolean;
};

// Plain fetch instead of a fetcher: a rejected fetcher bubbles to the route ErrorBoundary and unmounts the
// form (spec §5). App Bridge adds the session token to requests to the app's own origin.
export async function requestJson<ResponseBody>(
  url: string,
  requestInit: RequestJsonInit = {},
): Promise<JsonResult<ResponseBody>> {
  const endLoading = requestInit.loading ? beginLoading() : null;
  const hasBody = requestInit.body !== undefined;

  try {
    const response = await fetch(url, {
      method: requestInit.method ?? (hasBody ? "POST" : "GET"),
      headers: {
        Accept: "application/json",
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
      },
      body: hasBody ? JSON.stringify(requestInit.body) : undefined,
      signal: requestInit.signal,
    });
    const responseBody: unknown = await response.json().catch(() => undefined);

    if (requestInit.signal?.aborted) {
      return { ok: false, kind: "aborted" };
    }

    return responseBody !== null && typeof responseBody === "object"
      ? (responseBody as ResponseBody)
      : { ok: false, kind: "server" };
  } catch {
    return {
      ok: false,
      kind: requestInit.signal?.aborted ? "aborted" : "network",
    };
  } finally {
    endLoading?.();
  }
}

export function isNetworkFailure(value: unknown): value is NetworkFailure {
  if (value === null || typeof value !== "object") {
    return false;
  }

  return (
    "ok" in value &&
    "kind" in value &&
    value.ok === false &&
    (value.kind === "network" ||
      value.kind === "server" ||
      value.kind === "aborted")
  );
}
