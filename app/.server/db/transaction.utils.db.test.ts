import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "~/.server/db/prisma.singleton";
import { importCertificate } from "~/.server/services/certificates/certificate-import.service";
import {
  makeWrite,
  SHOP,
} from "../../../tests/helpers/certificate-row.factory";
import {
  setTransactionSleepForTests,
  TRANSACTION_LIMITS,
  withTransactionRetry,
} from "./transaction.utils";

const knownError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError(`Failed with ${code}.`, {
    code,
    clientVersion: Prisma.prismaVersion.client,
  });

const START_TIMEOUT = knownError("P2028");
const originalTransaction = prisma.$transaction.bind(prisma);

let sleeps: number[];

// The client is a proxy that forgets a deleted property, so vi.spyOn's restore would break it;
// the stub and the restore both define the property instead.
function setTransaction(value: unknown): void {
  Object.defineProperty(prisma, "$transaction", {
    value,
    configurable: true,
    writable: true,
  });
}

function stubTransaction() {
  const stub = vi.fn(originalTransaction);

  setTransaction(stub);

  return stub;
}

beforeEach(() => {
  sleeps = [];
  setTransactionSleepForTests(async (durationMs) => {
    sleeps.push(durationMs);
  });
});

afterEach(() => {
  setTransaction(originalTransaction);
  setTransactionSleepForTests(null);
});

describe("transaction retry", () => {
  it("retries an import whose transaction couldn't start, with the longer limits", async () => {
    const transaction = stubTransaction().mockRejectedValueOnce(START_TIMEOUT);

    await importCertificate(SHOP, makeWrite(), { createdAt: new Date() });

    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transaction.mock.calls[1][1]).toEqual(TRANSACTION_LIMITS);
    expect(sleeps).toHaveLength(1);
    expect(await prisma.certificate.count()).toBe(1);
    expect(await prisma.syncFailure.count()).toBe(1);
  });

  it("retries connection errors up to 3 times, then gives up", async () => {
    const run = vi.fn().mockRejectedValue(knownError("P1017"));

    await expect(withTransactionRetry(run)).rejects.toThrow("P1017");

    expect(run).toHaveBeenCalledTimes(4);
    expect(sleeps).toHaveLength(3);
  });

  it("never retries a unique violation", async () => {
    await importCertificate(SHOP, makeWrite(), { createdAt: new Date() });

    const transaction = stubTransaction();

    await expect(
      importCertificate(SHOP, makeWrite(), { createdAt: new Date() }),
    ).rejects.toMatchObject({ code: "P2002" });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });
});
