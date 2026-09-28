import { Prisma } from "@prisma/client";
import type { Transaction } from "./db.types";
import prisma from "./prisma.singleton";
import { prismaErrorCode } from "./prisma-errors.utils";

type Sleep = (durationMs: number) => Promise<void>;
type TransactionOptions = {
  isolationLevel?: Prisma.TransactionIsolationLevel;
};

// Prisma's defaults (2 s to get a connection, 5 s to finish) are too short for a remote database
// behind a proxy, where a CLI run otherwise stops with P2028.
export const TRANSACTION_LIMITS = { maxWait: 15_000, timeout: 30_000 } as const;

// P2028: the transaction couldn't start or expired, so it was rolled back. P1001 and P1017: the
// connection failed. Validation and unique errors are never retried.
const RETRYABLE_CODES = new Set(["P2028", "P1001", "P1017"]);
const RETRY_DELAYS_MS = [250, 1_000, 3_000];

let sleepOverride: Sleep | null = null;

export function setTransactionSleepForTests(replacement: Sleep | null): void {
  sleepOverride = replacement;
}

function sleep(durationMs: number): Promise<void> {
  if (sleepOverride) {
    return sleepOverride(durationMs);
  }

  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function isRetryable(error: unknown): boolean {
  const code =
    error instanceof Prisma.PrismaClientInitializationError
      ? (error.errorCode ?? null)
      : prismaErrorCode(error);

  return code !== null && RETRYABLE_CODES.has(code);
}

export async function withTransactionRetry<Result>(
  run: () => Promise<Result>,
): Promise<Result> {
  for (const delayMs of RETRY_DELAYS_MS) {
    try {
      return await run();
    } catch (error) {
      if (!isRetryable(error)) {
        throw error;
      }

      await sleep(delayMs);
    }
  }

  return run();
}

export function runTransaction<Result>(
  work: (transaction: Transaction) => Promise<Result>,
  options: TransactionOptions = {},
): Promise<Result> {
  return withTransactionRetry(() =>
    prisma.$transaction(work, { ...TRANSACTION_LIMITS, ...options }),
  );
}
