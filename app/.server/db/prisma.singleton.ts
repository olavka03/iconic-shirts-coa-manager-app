import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var -- only a var declaration adds a property to globalThis
  var prismaGlobal: PrismaClient;
}

if (process.env.NODE_ENV !== "production" && !global.prismaGlobal) {
  global.prismaGlobal = new PrismaClient();
}

const prisma = global.prismaGlobal ?? new PrismaClient();

export default prisma;
