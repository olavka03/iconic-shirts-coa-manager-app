import { describe, expect, it } from "vitest";
import {
  isRecordNotFound,
  isUniqueViolation,
  prismaErrorCode,
} from "./prisma-errors.utils";

describe("prisma error helpers", () => {
  it("returns null and false for anything that isn't a Prisma request error", () => {
    const error = Object.assign(new Error("P2002"), { code: "P2002" });

    expect(prismaErrorCode(error)).toBeNull();
    expect(isUniqueViolation(error)).toBe(false);
    expect(isRecordNotFound("P2025")).toBe(false);
  });
});
