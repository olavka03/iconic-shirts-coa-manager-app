import { afterAll, beforeEach } from "vitest";
import prisma from "~/.server/db/prisma.singleton";

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    "TRUNCATE signers, certificates, sync_failures, sessions RESTART IDENTITY CASCADE",
  );
});
afterAll(async () => {
  await prisma.$disconnect();
});
