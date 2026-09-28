import {
  HttpRequestError,
  HttpResponseError,
  InvalidJwtError,
} from "@shopify/shopify-api";
import { SessionNotFoundError } from "@shopify/shopify-app-react-router/server";
import { describe, expect, it, vi } from "vitest";
import { unauthenticated } from "./shopify-app.config";
import {
  adminForShop,
  classifyAdminForShopError,
} from "./admin-for-shop.service";

const { admin } = vi.hoisted(() => ({ admin: { graphql: vi.fn() } }));

vi.mock("./shopify-app.config", () => ({
  unauthenticated: {
    admin: vi.fn(async () => ({ admin, session: {} })),
  },
}));

const responseError = (body: Record<string, unknown>) =>
  new HttpResponseError({
    message: "Bad Request",
    code: 400,
    statusText: "Bad Request",
    body,
  });

describe("adminForShop", () => {
  it("returns the shop and its offline admin client", async () => {
    const shopContext = await adminForShop("a.myshopify.com");

    expect(unauthenticated.admin).toHaveBeenCalledWith("a.myshopify.com");
    expect(shopContext).toEqual({ shop: "a.myshopify.com", admin });
    expect(shopContext.admin).toBe(admin);
  });
});

describe("classifyAdminForShopError", () => {
  it.each([
    ["a missing session", "no_session", new SessionNotFoundError("x")],
    ["an invalid JWT", "reauth", new InvalidJwtError("x")],
    [
      "a rejected refresh token",
      "reauth",
      responseError({
        error: "invalid_subject_token",
        error_description: "expired",
      }),
    ],
    ["a failed refresh", "retry", new Response("", { status: 500 })],
    [
      "a request that never reached Shopify",
      "retry",
      new HttpRequestError("x"),
    ],
    ["a network failure", "retry", new TypeError("fetch failed")],
    ["any other error", "fatal", new Error("x")],
    ["a client error response", "fatal", new Response("", { status: 401 })],
    ["another HTTP error body", "fatal", responseError({ error: "other" })],
    ["a programming TypeError", "fatal", new TypeError("x is not a function")],
    ["a thrown string", "fatal", "boom"],
  ])("%s → %s", (_label, expected, error) => {
    expect(classifyAdminForShopError(error)).toBe(expected);
  });
});
