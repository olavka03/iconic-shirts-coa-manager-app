import { describe, expect, it } from "vitest";
import fixture from "../fixtures/legacy-certificates.fixture.json";
import { assertTestDatabaseName } from "../setup/test-env.config";

describe("unit environment", () => {
  it("runs in America/Los_Angeles so non-UTC date handling shows up", () => {
    expect(new Date("2026-01-15T12:00:00Z").getTimezoneOffset()).toBe(480);
  });
  it("has no database", () => {
    expect(process.env.DATABASE_URL).toContain("unit-tests-have-no-database");
  });
  it("has the 375-record legacy fixture", () => {
    expect(fixture).toHaveLength(375);
  });
});

describe("test database names", () => {
  it.each([
    "coa_manager_test",
    "coa_manager_test_t0",
    "coa_manager_test_reviewt0",
    "coa_manager_test_review_t0",
    "coa_manager_test_t8_2",
  ])("accepts %s", (name) => {
    expect(assertTestDatabaseName(name)).toBe(name);
  });

  it.each([
    "coa_manager_dev",
    "coa_manager_testx",
    "coa_manager_test_",
    "coa_manager_test__t0",
    "coa_manager_test_T0",
    "coa_manager_test_t0-2",
    "coa_manager_test_t0;drop",
    "postgres",
    "",
  ])("refuses %j", (name) => {
    expect(() => assertTestDatabaseName(name)).toThrow(/Refusing to use/);
  });
});
