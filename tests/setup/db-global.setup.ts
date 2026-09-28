import { execSync } from "node:child_process";
import { TEST_DATABASE_URL } from "./test-env.config";

export default function setup(): void {
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
