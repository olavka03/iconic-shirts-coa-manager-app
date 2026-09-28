import { useCallback, useEffect, useRef, useState } from "react";
import { codeError } from "~/features/codes/utils/code.utils";
import type {
  CodeCheckResponse,
  UsedBy,
} from "~/features/codes/types/codes.types";
import {
  isNetworkFailure,
  requestJson,
  type JsonResult,
} from "~/shared/utils/json-request.utils";
import { useLatest } from "~/shared/hooks/use-latest.hook";

type CheckResult =
  | { status: "taken"; usedBy: UsedBy }
  | { status: "idle" | "checking" | "free"; usedBy: null };

export type CodeCheck = CheckResult & { checkNow(): void };

type CodeCheckOptions = {
  enabled: boolean;
  excludeId: string | null;
  savedCode: string | null;
  onTaken(code: string): void;
};

type CodeResult = { code: string; result: CheckResult };

const CHECK_DELAY_MS = 400;
const IDLE: CheckResult = { status: "idle", usedBy: null };

function codeCheckUrl(code: string, excludeId: string | null): string {
  const searchParams = new URLSearchParams({ code });

  if (excludeId !== null) {
    searchParams.set("exclude", String(excludeId));
  }

  return `/api/codes?${searchParams}`;
}

// A failed or unexpected answer shows nothing: the server checks the code again on save.
function toResult(response: JsonResult<CodeCheckResponse>): CheckResult {
  if (isNetworkFailure(response) || !("available" in response)) {
    return IDLE;
  }

  if (response.available) {
    return { status: "free", usedBy: null };
  }

  return response.usedBy ? { status: "taken", usedBy: response.usedBy } : IDLE;
}

export function useCodeCheck(
  code: string,
  { enabled, excludeId, savedCode, onTaken }: CodeCheckOptions,
): CodeCheck {
  const [lastResult, setLastResult] = useState<CodeResult | null>(null);
  const requestController = useRef<AbortController | null>(null);
  const checkedCode = useRef<string | null>(null);
  const latestOnTaken = useLatest(onTaken);
  const checkable = enabled && code !== savedCode && codeError(code) === null;

  const runCheck = useCallback(async () => {
    if (!checkable || checkedCode.current === code) {
      return;
    }

    const controller = new AbortController();

    requestController.current?.abort();
    requestController.current = controller;
    checkedCode.current = code;
    setLastResult({ code, result: { status: "checking", usedBy: null } });

    const response = await requestJson<CodeCheckResponse>(
      codeCheckUrl(code, excludeId),
      { signal: controller.signal },
    );

    if (controller.signal.aborted) {
      return;
    }

    const result = toResult(response);

    requestController.current = null;

    if (result.status === "idle") {
      checkedCode.current = null;
    }

    setLastResult({ code, result });

    if (result.status === "taken") {
      latestOnTaken.current(code);
    }
  }, [checkable, code, excludeId, latestOnTaken]);

  useEffect(() => {
    const timer = setTimeout(() => void runCheck(), CHECK_DELAY_MS);

    return () => {
      clearTimeout(timer);
      requestController.current?.abort();
      requestController.current = null;
      checkedCode.current = null;
    };
  }, [runCheck]);

  const current =
    checkable && lastResult?.code === code ? lastResult.result : IDLE;

  return { ...current, checkNow: () => void runCheck() };
}
