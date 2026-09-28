import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CodeCheckResult } from "~/features/codes/types/codes.types";
import { useCodeCheck } from "./use-code-check.hook";
import { requestJson } from "~/shared/utils/json-request.utils";
import { testId } from "../../../../tests/helpers/test-ids.utils";

vi.mock("~/shared/utils/json-request.utils", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("~/shared/utils/json-request.utils")
  >()),
  requestJson: vi.fn(),
}));

type Pending = {
  url: string;
  signal: AbortSignal | undefined;
  resolve(body: unknown): void;
};

const pending: Pending[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  pending.length = 0;
  vi.mocked(requestJson).mockImplementation(
    ((url: string, requestInit?: { signal?: AbortSignal }) =>
      new Promise<unknown>((resolve) => {
        pending.push({
          url,
          signal: requestInit?.signal,
          resolve: (body) =>
            resolve(
              requestInit?.signal?.aborted
                ? { ok: false, kind: "aborted" }
                : body,
            ),
        });
      })) as typeof requestJson,
  );
});

afterEach(() => {
  vi.mocked(requestJson).mockReset();
});

const FREE: CodeCheckResult = {
  code: "IS141002RLBM1516",
  error: null,
  available: true,
  usedBy: null,
};
const TAKEN: CodeCheckResult = {
  code: "IS141002RLBM1516",
  error: null,
  available: false,
  usedBy: {
    id: testId(7),
    signers: "Robert Lewandowski",
    item: "Bayern Munich shirt",
  },
};

type CheckProps = {
  code: string;
  enabled?: boolean;
  excludeId?: string | null;
  savedCode?: string | null;
};

function renderCheck(initial: CheckProps) {
  const onTaken = vi.fn();
  const view = renderHook(
    ({
      code,
      enabled = true,
      excludeId = null,
      savedCode = null,
    }: CheckProps) =>
      useCodeCheck(code, { enabled, excludeId, savedCode, onTaken }),
    { initialProps: initial },
  );

  return { ...view, onTaken };
}

async function answer(index: number, body: unknown) {
  await act(async () => {
    pending[index].resolve(body);
  });
}

describe("useCodeCheck", () => {
  it("checks 400 ms after the last change and reports a free code", async () => {
    const { result, rerender } = renderCheck({ code: "IS14" });

    rerender({ code: "IS141002RLBM1516" });
    act(() => vi.advanceTimersByTime(399));

    expect(pending).toHaveLength(0);
    expect(result.current.status).toBe("idle");

    act(() => vi.advanceTimersByTime(1));

    expect(pending.map((request) => request.url)).toEqual([
      "/api/codes?code=IS141002RLBM1516",
    ]);
    expect(result.current.status).toBe("checking");

    await answer(0, FREE);

    expect(result.current.status).toBe("free");
    expect(result.current.usedBy).toBeNull();
  });

  it("sends this certificate's id to leave it out", () => {
    renderCheck({ code: "IS141002RLBM1516", excludeId: testId(7) });
    act(() => vi.advanceTimersByTime(400));

    expect(pending[0].url).toBe(
      `/api/codes?code=IS141002RLBM1516&exclude=${testId(7)}`,
    );
  });

  it("reports a taken code and calls onTaken", async () => {
    const { result, onTaken } = renderCheck({ code: "IS141002RLBM1516" });

    act(() => vi.advanceTimersByTime(400));
    await answer(0, TAKEN);

    expect(result.current.status).toBe("taken");
    expect(result.current.usedBy).toEqual(TAKEN.usedBy);
    expect(onTaken).toHaveBeenCalledWith("IS141002RLBM1516");
  });

  it("aborts an older request when the code changes", async () => {
    const { result, rerender, onTaken } = renderCheck({
      code: "IS141002RLBM1516",
    });

    act(() => vi.advanceTimersByTime(400));
    rerender({ code: "IS141002RLBM1516-2" });

    expect(pending[0].signal?.aborted).toBe(true);

    await answer(0, TAKEN);

    expect(onTaken).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");

    act(() => vi.advanceTimersByTime(400));

    expect(pending[1].url).toBe("/api/codes?code=IS141002RLBM1516-2");
  });

  it("checks at once on checkNow, without a second request for the same code", async () => {
    const { result } = renderCheck({ code: "IS141002RLBM1516" });

    act(() => result.current.checkNow());

    expect(pending).toHaveLength(1);

    act(() => vi.advanceTimersByTime(400));
    act(() => result.current.checkNow());

    expect(pending).toHaveLength(1);

    await answer(0, FREE);

    expect(result.current.status).toBe("free");
  });

  it("skips invalid codes, the saved code and a disabled check", () => {
    const { result, rerender } = renderCheck({ code: "IS1" });

    act(() => vi.advanceTimersByTime(400));
    act(() => result.current.checkNow());
    rerender({ code: "IS 141002" });
    act(() => vi.advanceTimersByTime(400));
    rerender({ code: "IS141002RLBM1516", savedCode: "IS141002RLBM1516" });
    act(() => vi.advanceTimersByTime(400));
    act(() => result.current.checkNow());
    rerender({ code: "IS141002RLBM1517", enabled: false });
    act(() => vi.advanceTimersByTime(400));

    expect(pending).toHaveLength(0);
    expect(result.current.status).toBe("idle");
  });

  it("shows nothing after a network failure and checks again on checkNow", async () => {
    const { result, onTaken } = renderCheck({ code: "IS141002RLBM1516" });

    act(() => vi.advanceTimersByTime(400));
    await answer(0, { ok: false, kind: "network" });

    expect(result.current.status).toBe("idle");
    expect(onTaken).not.toHaveBeenCalled();

    act(() => result.current.checkNow());

    expect(pending).toHaveLength(2);
  });

  it("shows nothing when the server rejects the code", async () => {
    const { result, onTaken } = renderCheck({ code: "IS141002RLBM1516" });

    act(() => vi.advanceTimersByTime(400));
    await answer(0, {
      code: "IS141002RLBM1516",
      error: "Use only letters, numbers, and hyphens.",
      available: false,
      usedBy: null,
    } satisfies CodeCheckResult);

    expect(result.current.status).toBe("idle");
    expect(result.current.usedBy).toBeNull();
    expect(onTaken).not.toHaveBeenCalled();
  });

  it("treats an unexpected answer as nothing to show", async () => {
    const { result, onTaken } = renderCheck({ code: "IS141002RLBM1516" });

    act(() => vi.advanceTimersByTime(400));
    await answer(0, { ok: false, formError: "unavailable" });

    expect(result.current.status).toBe("idle");
    expect(onTaken).not.toHaveBeenCalled();
  });
});
