import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests share one test database (separate from @dinkuan/core's), so run files one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    globalSetup: ["./test/global-setup.ts"],
    env: {
      DATABASE_URL:
        process.env.SOCIAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/dinkuan_social_test",
      KEY_ENCRYPTION_SECRET: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
      DEMO_MODE: "true",
      APP_URL: "http://localhost:3000",
    },
  },
});
