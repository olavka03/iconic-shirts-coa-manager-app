import { afterEach, describe, expect, it, vi } from "vitest";
import { isNetworkFailure, requestJson } from "./json-request.utils";
import {
  abortError,
  deferred,
  jsonResponse,
  stubFetch,
} from "../../../tests/helpers/fetch-stub.utils";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestJson", () => {
  it("resolves a rejected fetch to a network failure", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });

    await expect(requestJson("/api/codes?code=AB12")).resolves.toEqual({
      ok: false,
      kind: "network",
    });
  });

  it("resolves a 500 with an HTML body to a server failure", async () => {
    stubFetch(
      async () =>
        new Response("<!doctype html><h1>Application error</h1>", {
          status: 500,
          headers: { "Content-Type": "text/html" },
        }),
    );

    await expect(requestJson("/api/orders?q=1")).resolves.toEqual({
      ok: false,
      kind: "server",
    });
  });

  it("resolves a 2xx without a JSON object to a server failure", async () => {
    stubFetch(async () => new Response(null, { status: 204 }));

    await expect(requestJson("/api/orders?q=1")).resolves.toEqual({
      ok: false,
      kind: "server",
    });
  });

  it.each([null, 42, "text"])(
    "resolves a 200 with the JSON body %j to a server failure",
    async (body) => {
      stubFetch(async () => jsonResponse(body));

      await expect(requestJson("/api/orders?q=1")).resolves.toEqual({
        ok: false,
        kind: "server",
      });
    },
  );

  it("returns the JSON body of a 422 as it is", async () => {
    const body = { ok: false, fieldErrors: { item: "Enter the item." } };
    stubFetch(async () => jsonResponse(body, 422));

    await expect(
      requestJson("/api/certificates", { body: { intent: "create" } }),
    ).resolves.toEqual(body);
  });

  it("resolves a request aborted in flight to an aborted failure", async () => {
    stubFetch(
      (_url, requestInit) =>
        new Promise((_resolve, reject) => {
          requestInit.signal?.addEventListener("abort", () =>
            reject(abortError()),
          );
        }),
    );
    const controller = new AbortController();
    const pending = requestJson("/api/orders?q=1", {
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).resolves.toEqual({ ok: false, kind: "aborted" });
  });

  it("resolves an abort while the body is read to an aborted failure", async () => {
    const controller = new AbortController();
    stubFetch(async () => {
      const response = jsonResponse({ ok: true });
      vi.spyOn(response, "json").mockImplementation(async () => {
        controller.abort();
        throw abortError();
      });

      return response;
    });

    await expect(
      requestJson("/api/orders?q=1", { signal: controller.signal }),
    ).resolves.toEqual({ ok: false, kind: "aborted" });
  });

  it("posts a JSON body with a JSON content type", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({ ok: true, id: 7 }));

    const result = await requestJson<{ ok: true; id: number }>(
      "/api/certificates",
      { body: { intent: "create", values: { item: "Home shirt" } } },
    );

    expect(result).toEqual({ ok: true, id: 7 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, requestInit] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/certificates");
    expect(requestInit.method).toBe("POST");
    expect(requestInit.headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
    });
    expect(requestInit.body).toBe(
      JSON.stringify({ intent: "create", values: { item: "Home shirt" } }),
    );
  });

  it("sends a GET without a body or content type", async () => {
    const fetchMock = stubFetch(async () =>
      jsonResponse({ ok: true, free: true }),
    );
    const controller = new AbortController();

    await requestJson("/api/codes?code=AB12", { signal: controller.signal });

    const [, requestInit] = fetchMock.mock.calls[0];
    expect(requestInit.method).toBe("GET");
    expect(requestInit.headers).toEqual({ Accept: "application/json" });
    expect(requestInit.body).toBeUndefined();
    expect(requestInit.signal).toBe(controller.signal);
  });

  it("leaves the admin loading bar alone unless asked", async () => {
    stubFetch(async () => jsonResponse({ ok: true }));

    await requestJson("/api/codes?code=AB12");

    expect(shopify.loading).not.toHaveBeenCalled();
  });

  it("shows the admin loading bar while a loading request runs", async () => {
    stubFetch(async () => jsonResponse({ ok: true }));

    await requestJson("/api/certificates/1", {
      body: { intent: "delete" },
      loading: true,
    });

    expect(vi.mocked(shopify.loading).mock.calls).toEqual([[true], [false]]);
  });

  it("hides the admin loading bar after a failed loading request", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });

    await requestJson("/api/certificates/1", {
      body: { intent: "delete" },
      loading: true,
    });

    expect(vi.mocked(shopify.loading).mock.calls).toEqual([[true], [false]]);
  });

  it("keeps the admin loading bar until overlapping loading requests have both ended", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    const responses = [first.promise, second.promise];
    stubFetch(() => responses.shift()!);

    const updateRequest = requestJson("/api/certificates/1", {
      body: { intent: "update" },
      loading: true,
    });
    const deleteRequest = requestJson("/api/certificates", {
      body: { intent: "delete", ids: [2] },
      loading: true,
    });
    expect(shopify.loading).toHaveBeenLastCalledWith(true);

    first.resolve(jsonResponse({ ok: true }));
    await updateRequest;
    expect(shopify.loading).not.toHaveBeenCalledWith(false);

    second.resolve(jsonResponse({ ok: true }));
    await deleteRequest;
    expect(shopify.loading).toHaveBeenLastCalledWith(false);
    expect(
      vi
        .mocked(shopify.loading)
        .mock.calls.filter(([visible]) => visible === false),
    ).toHaveLength(1);
  });
});

describe("isNetworkFailure", () => {
  it("recognises the three failure kinds only", () => {
    expect(isNetworkFailure({ ok: false, kind: "network" })).toBe(true);
    expect(isNetworkFailure({ ok: false, kind: "server" })).toBe(true);
    expect(isNetworkFailure({ ok: false, kind: "aborted" })).toBe(true);
    expect(isNetworkFailure({ ok: false, fieldErrors: {} })).toBe(false);
    expect(isNetworkFailure({ ok: false, formError: "unavailable" })).toBe(
      false,
    );
    expect(isNetworkFailure({ ok: true, kind: "network" })).toBe(false);
    expect(isNetworkFailure(null)).toBe(false);
    expect(isNetworkFailure("network")).toBe(false);
  });
});
