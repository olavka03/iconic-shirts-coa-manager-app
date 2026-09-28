import { Prisma } from "@prisma/client";

export function prismaErrorCode(error: unknown): string | null {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code
    : null;
}

export const isUniqueViolation = (error: unknown): boolean =>
  prismaErrorCode(error) === "P2002";

export const isRecordNotFound = (error: unknown): boolean =>
  prismaErrorCode(error) === "P2025";
