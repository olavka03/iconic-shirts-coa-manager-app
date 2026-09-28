import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
import {
  SERVER_TEST_ENV,
  TEST_DATABASE_URL,
} from "./tests/setup/test-env.config";

// Unit and UI tests must never reach a database: a wrong URL makes an accidental query fail fast
// instead of touching coa_manager_dev through .env.
const NO_DB_ENV = {
  ...SERVER_TEST_ENV,
  TZ: "America/Los_Angeles",
  DATABASE_URL: "postgresql://unit-tests-have-no-database@127.0.0.1:1/none",
};

export default defineConfig({
  esbuild: { jsx: "automatic" },
  // Vitest doesn't load vite.config.ts (tsconfigPaths), so the ~ alias is set here.
  resolve: { alias: { "~": fileURLToPath(new URL("./app", import.meta.url)) } },
  test: {
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          pool: "forks",
          include: [
            "app/**/*.test.ts",
            "scripts/**/*.test.ts",
            "tests/guards/**/*.test.ts",
            "tests/quality/**/*.test.ts",
            "tests/fakes/**/*.test.ts",
          ],
          exclude: [...configDefaults.exclude, "**/*.db.test.ts"],
          env: NO_DB_ENV,
          setupFiles: ["tests/setup/unit.setup.ts"],
          testTimeout: 60_000,
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          environment: "node",
          pool: "forks",
          // One fork for every db file: they share one database and truncate it before each test.
          poolOptions: { forks: { singleFork: true } },
          include: ["**/*.db.test.ts", "tests/routes/**/*.test.ts"],
          exclude: [...configDefaults.exclude],
          env: { ...SERVER_TEST_ENV, DATABASE_URL: TEST_DATABASE_URL },
          globalSetup: ["tests/setup/db-global.setup.ts"],
          setupFiles: ["tests/setup/db-reset.setup.ts"],
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
      {
        extends: true,
        test: {
          name: "ui",
          environment: "happy-dom",
          include: ["app/**/*.test.tsx"],
          exclude: [...configDefaults.exclude],
          env: NO_DB_ENV,
          setupFiles: ["tests/setup/ui.setup.ts"],
        },
      },
    ],
  },
});
