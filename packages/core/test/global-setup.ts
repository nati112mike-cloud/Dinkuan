import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/dinkuan_test";
  // Apply migrations only; each test file truncates its tables (see helpers.resetDb).
  execSync("pnpm exec prisma migrate deploy", {
    cwd: fileURLToPath(new URL("../../db", import.meta.url)),
    env: { ...process.env, DATABASE_URL: url },
    stdio: "ignore",
  });
}
