import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests share one test database of their own, so run files one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    globalSetup: ["./test/global-setup.ts"],
    env: {
      DATABASE_URL: process.env.MARKET_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/dinkuan_market_test",
      KEY_ENCRYPTION_SECRET: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
      PAYMENT_WEBHOOK_SECRET: "test-webhook-secret",
      DEMO_MODE: "true",
      APP_URL: "http://localhost:3000",
    },
  },
});
