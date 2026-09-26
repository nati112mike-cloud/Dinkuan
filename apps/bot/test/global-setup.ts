import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export default function setup() {
  const url = process.env.BOT_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/dinkuan_bot_test";
  const cwd = fileURLToPath(new URL("../../../packages/db", import.meta.url));
  // Create the database on first run (ignored when it already exists), then apply migrations.
  const admin = url.replace(/\/[^/?]+(\?|$)/, "/postgres$1");
  const name = new URL(url).pathname.slice(1);
  try {
    execSync(`pnpm exec prisma db execute --url "${admin}" --stdin`, { cwd, input: `CREATE DATABASE "${name}"`, stdio: ["pipe", "ignore", "ignore"] });
  } catch {
    // already exists
  }
  execSync("pnpm exec prisma migrate deploy", { cwd, env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });
}
