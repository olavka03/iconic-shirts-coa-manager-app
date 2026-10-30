import { describe, expect, it } from "vitest";
import { clientAddress, proxyJsonResponse } from "./proxy-request.utils";

function requestWithForwardedFor(value?: string): Request {
  const headers = new Headers();

  if (value !== undefined) {
    headers.set("x-forwarded-for", value);
  }

  return new Request("https://example.test/apps/proxy", { headers });
}

describe("clientAddress", () => {
  it("returns the first hop of X-Forwarded-For, trimmed", () => {
    expect(
      clientAddress(requestWithForwardedFor("203.0.113.9, 10.0.0.1")),
    ).toBe("203.0.113.9");
    expect(clientAddress(requestWithForwardedFor("  198.51.100.4  "))).toBe(
      "198.51.100.4",
    );
  });

  it('returns "unknown" without the header or with an empty one', () => {
    expect(clientAddress(requestWithForwardedFor())).toBe("unknown");
    expect(clientAddress(requestWithForwardedFor(""))).toBe("unknown");
  });
});

describe("proxyJsonResponse", () => {
  it("sets Cache-Control no-store and X-Robots-Tag noindex", () => {
    const response = proxyJsonResponse({ found: false });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
  });

  it("keeps the status and merges extra headers", () => {
    const response = proxyJsonResponse({ error: "rate_limited" }, 429, {
      "Retry-After": "60",
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
  });

  it("serialises the body", async () => {
    const body = { found: true, certificate: { code: "ABC" } };

    expect(await proxyJsonResponse(body).json()).toEqual(body);
  });
});
