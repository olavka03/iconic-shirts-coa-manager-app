import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// A minimal App Bridge global for components (tests never load app-bridge.js or polaris.js).
beforeEach(() => {
  (globalThis as { shopify?: unknown }).shopify = {
    toast: { show: vi.fn() },
    loading: vi.fn(),
    saveBar: {
      show: vi.fn(),
      hide: vi.fn(),
      leaveConfirmation: vi.fn(async () => undefined),
    },
    resourcePicker: vi.fn(async () => undefined),
    intents: { invoke: vi.fn() },
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
