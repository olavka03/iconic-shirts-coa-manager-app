import { redirect } from "react-router";
import { vi } from "vitest";
import { authenticate } from "~/.server/shopify/shopify-app.config";
import type { FakeAdmin } from "../fakes/admin-api.fake";
import { SHOP } from "../helpers/certificate-row.factory";

// vi.mock is hoisted per file, so every route test mocks app/.server/shopify/shopify-app.config itself, with
// authenticate.admin as a vi.fn(); these helpers then drive that mock.
type AuthenticatedAdmin = Awaited<ReturnType<typeof authenticate.admin>>;

const ORIGIN = "https://app.test";

export function mockAdmin(fake: FakeAdmin, shop: string = SHOP): void {
  vi.mocked(authenticate.admin).mockResolvedValue({
    admin: fake.client,
    session: { shop },
    redirect,
  } as unknown as AuthenticatedAdmin);
}

export function jsonRequest(path: string, body?: unknown): Request {
  return new Request(new URL(path, ORIGIN), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function getRequest(path: string): Request {
  return new Request(new URL(path, ORIGIN));
}

export function routeArguments<RouteParams extends Record<string, string>>(
  request: Request,
  params = {} as RouteParams,
) {
  return {
    request,
    params,
    context: {},
    url: new URL(request.url),
    pattern: "",
  };
}

export async function readJson(
  response: Response,
): Promise<{ status: number; body: unknown }> {
  return { status: response.status, body: await response.json() };
}
