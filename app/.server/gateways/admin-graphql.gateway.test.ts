import type { AdminOperations } from "@shopify/admin-api-client";
import {
  GraphqlQueryError,
  HttpRequestError,
  HttpResponseError,
  InvalidJwtError,
} from "@shopify/shopify-api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFakeAdmin,
  type FakeAdmin,
} from "../../../tests/fakes/admin-api.fake";
import {
  AdminApiError,
  adminGraphql,
  isAdminApiError,
  setSleepForTests,
  toAdminApiError,
} from "./admin-graphql.gateway";
import { fetchShopInfo } from "./shop.gateway";

const SHOP_QUERY =
  "query CoaShopInfo { shop { name } }" as keyof AdminOperations;
const CUSTOMER_DATA_MESSAGE =
  "This app is not approved to access the Order object. See https://shopify.dev/docs/apps/launch/protected-customer-data for more details.";

let fake: FakeAdmin;
let sleeps: number[];

beforeEach(() => {
  fake = createFakeAdmin();
  sleeps = [];
  setSleepForTests(async (durationMs) => {
    sleeps.push(durationMs);
  });
});

afterEach(() => setSleepForTests(null));

async function failure(promise: Promise<unknown>): Promise<AdminApiError> {
  const error = await promise.then(
    () => null,
    (rejection: unknown) => rejection,
  );

  expect(isAdminApiError(error)).toBe(true);

  return error as AdminApiError;
}

describe("adminGraphql", () => {
  it("returns the data of the response", async () => {
    await expect(adminGraphql(fake.client, SHOP_QUERY)).resolves.toEqual({
      shop: fake.shop,
    });
  });

  it("retries a throttled call after at least a second each time", async () => {
    fake.failNext("CoaShopInfo", { throw: "throttled" }, 2);

    await expect(fetchShopInfo(fake.client)).resolves.toMatchObject({
      name: "Iconic Shirts Test",
    });
    expect(sleeps).toHaveLength(2);
    expect(sleeps.every((durationMs) => durationMs >= 1000)).toBe(true);
    expect(fake.callsTo("CoaShopInfo")).toHaveLength(3);
  });

  it("gives up after five throttle retries", async () => {
    fake.failNext("CoaShopInfo", { throw: "throttled" }, 6);

    const error = await failure(fetchShopInfo(fake.client));

    expect(error.kind).toBe("throttled");
    expect(error.code).toBe("THROTTLED");
    expect(fake.callsTo("CoaShopInfo")).toHaveLength(6);
    expect(sleeps).toHaveLength(5);
  });

  it("waits for the points the query needs at the restore rate", async () => {
    const inner = fake.client.graphql;
    let throttled = false;

    fake.client.graphql = (async (query: string, options?: unknown) => {
      if (!throttled) {
        throttled = true;

        throw new GraphqlQueryError({
          message: "Throttled",
          response: {},
          body: {
            errors: {
              graphQLErrors: [
                { message: "Throttled", extensions: { code: "THROTTLED" } },
              ],
            },
            extensions: {
              cost: {
                requestedQueryCost: 500,
                throttleStatus: {
                  maximumAvailable: 2000,
                  currentlyAvailable: 100,
                  restoreRate: 100,
                },
              },
            },
          },
        });
      }

      return inner(query as never, options as never);
    }) as typeof inner;

    await fetchShopInfo(fake.client);

    expect(sleeps).toEqual([4000]);
  });

  it("reports a missing scope as access_denied with reason scope, without retrying", async () => {
    fake.failNext("CoaShopInfo", { throw: "access_denied" });

    const error = await failure(fetchShopInfo(fake.client));

    expect(error).toMatchObject({
      kind: "access_denied",
      reason: "scope",
      code: "ACCESS_DENIED",
    });
    expect(error.message).toMatch(/read_orders/);
    expect(fake.callsTo("CoaShopInfo")).toHaveLength(1);
  });

  it("reports unapproved protected customer data as reason customer_data", async () => {
    fake.failNext("CoaShopInfo", {
      throw: "access_denied",
      message: CUSTOMER_DATA_MESSAGE,
    });

    const error = await failure(fetchShopInfo(fake.client));

    expect(error).toMatchObject({
      kind: "access_denied",
      reason: "customer_data",
    });
    expect(error.message).toBe(CUSTOMER_DATA_MESSAGE);
  });

  it("keeps a thrown 401 Response for App Bridge", async () => {
    fake.failNext("CoaShopInfo", { throwResponse: 401 });

    const error = await failure(fetchShopInfo(fake.client));

    expect(error).toMatchObject({ kind: "auth", status: 401 });
    expect(error.response?.status).toBe(401);
  });

  it("treats a thrown 403 Response as auth", async () => {
    fake.failNext("CoaShopInfo", { throwResponse: 403 });

    expect((await failure(fetchShopInfo(fake.client))).kind).toBe("auth");
  });

  it("treats a thrown 429 Response as throttled and retries it", async () => {
    fake.failNext("CoaShopInfo", { throwResponse: 429 });

    await expect(fetchShopInfo(fake.client)).resolves.toBeDefined();
    expect(sleeps).toEqual([1000]);

    fake.failNext("CoaShopInfo", { throwResponse: 429 });

    const error = await failure(
      fetchShopInfo(fake.client, { maxThrottleRetries: 0 }),
    );

    expect(error).toMatchObject({ kind: "throttled", status: 429 });
  });

  it("treats a thrown 500 Response as http", async () => {
    fake.failNext("CoaShopInfo", { throwResponse: 500 });

    const error = await failure(fetchShopInfo(fake.client));

    expect(error).toMatchObject({ kind: "http", status: 500 });
    expect(fake.callsTo("CoaShopInfo")).toHaveLength(1);
  });

  it("reports a failed fetch as network", async () => {
    fake.failNext("CoaShopInfo", { throw: "network" });

    expect((await failure(fetchShopInfo(fake.client))).kind).toBe("network");
  });

  it("reports a timeout as timeout", async () => {
    fake.failNext("CoaShopInfo", { throw: "timeout" });

    expect((await failure(fetchShopInfo(fake.client))).kind).toBe("timeout");
  });

  it("reports an aborted signal as timeout", async () => {
    const controller = new AbortController();

    controller.abort();

    const error = await failure(
      fetchShopInfo(fake.client, { signal: controller.signal }),
    );

    expect(error.kind).toBe("timeout");
  });

  it("stops retrying once the signal is aborted", async () => {
    const controller = new AbortController();

    fake.failNext("CoaShopInfo", { throw: "throttled" }, 3);
    setSleepForTests(async () => {
      controller.abort();
    });

    const error = await failure(
      fetchShopInfo(fake.client, { signal: controller.signal }),
    );

    expect(error.kind).toBe("timeout");
    expect(fake.callsTo("CoaShopInfo")).toHaveLength(2);
  });

  it("paces until about 100 points are available again", async () => {
    fake.throttleStatus.currentlyAvailable = 40;

    await fetchShopInfo(fake.client, { pace: true });

    expect(sleeps).toEqual([600]);
  });

  it("doesn't pace without pace: true or with enough points", async () => {
    fake.throttleStatus.currentlyAvailable = 40;
    await fetchShopInfo(fake.client);

    fake.throttleStatus.currentlyAvailable = 1990;
    await fetchShopInfo(fake.client, { pace: true });

    expect(sleeps).toEqual([]);
  });

  it("sleeps for real when no test sleep is set, and wakes early on abort", async () => {
    setSleepForTests(null);
    fake.failNext("CoaShopInfo", { throw: "throttled" });

    const controller = new AbortController();
    const pending = fetchShopInfo(fake.client, { signal: controller.signal });

    setTimeout(() => controller.abort(), 20);

    const started = Date.now();
    const error = await failure(pending);

    expect(error.kind).toBe("timeout");
    expect(Date.now() - started).toBeLessThan(900);
  });
});

describe("toAdminApiError", () => {
  it("passes an AdminApiError through", () => {
    const error = new AdminApiError("graphql", "x");

    expect(toAdminApiError(error)).toBe(error);
  });

  it("maps other GraphQL errors to graphql with their code", () => {
    const error = toAdminApiError(
      new GraphqlQueryError({
        message: "Field 'x' doesn't exist on type 'Shop'",
        response: {},
        body: {
          errors: {
            graphQLErrors: [
              {
                message: "Field 'x' doesn't exist on type 'Shop'",
                extensions: { code: "undefinedField" },
              },
            ],
          },
        },
      }),
    );

    expect(error).toMatchObject({ kind: "graphql", code: "undefinedField" });
    expect(error.message).toBe("Field 'x' doesn't exist on type 'Shop'");
  });

  it("maps HttpResponseError by status (non-embedded contexts)", () => {
    const httpError = (code: number) =>
      new HttpResponseError({ message: `HTTP ${code}`, code, statusText: "" });

    expect(toAdminApiError(httpError(401))).toMatchObject({
      kind: "auth",
      status: 401,
    });
    expect(toAdminApiError(httpError(429)).kind).toBe("throttled");
    expect(toAdminApiError(httpError(502))).toMatchObject({
      kind: "http",
      status: 502,
    });
  });

  it("maps an invalid session token to auth", () => {
    expect(toAdminApiError(new InvalidJwtError("bad token")).kind).toBe("auth");
  });

  it("maps a fetch TypeError to network and an AbortError to timeout", () => {
    expect(toAdminApiError(new TypeError("fetch failed")).kind).toBe("network");
    expect(
      toAdminApiError(
        new DOMException("The operation was aborted.", "AbortError"),
      ).kind,
    ).toBe("timeout");
  });

  it("maps the request error Shopify's client throws after an abort to timeout", () => {
    const abortedSignal = AbortSignal.abort();
    const abortedRequest = new HttpRequestError(
      "Http request error, no response available: This operation was aborted",
    );

    expect(toAdminApiError(abortedRequest, abortedSignal).kind).toBe("timeout");
  });

  it("maps anything else to graphql", () => {
    expect(toAdminApiError(new Error("boom"))).toMatchObject({
      kind: "graphql",
      message: "boom",
    });
    expect(toAdminApiError("boom").message).toBe("boom");
  });
});
