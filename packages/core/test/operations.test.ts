import { prisma } from "@dinkuan/db";
import { beforeEach, describe, expect, it } from "vitest";
import { hitRateLimit, parseDsn, pruneRateLimits, RATE_LIMITS, RateLimitError, safePath, sentryEnvelope } from "../src/server";
import { resetDb } from "./helpers";

beforeEach(resetDb);

describe("rate limits", () => {
  it("allows the limit, then refuses with RATE_LIMITED and a retry time within the window", async () => {
    const now = new Date("2026-09-26T10:15:00Z");
    const { limit } = RATE_LIMITS.otpRequestIp;
    for (let i = 0; i < limit; i++) await hitRateLimit("otpRequestIp", "203.0.113.7", now);
    const err = await hitRateLimit("otpRequestIp", "203.0.113.7", now).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err).toMatchObject({ code: "RATE_LIMITED", retryAfterSec: 45 * 60 });
    // Other IPs and other actions have their own counters.
    await hitRateLimit("otpRequestIp", "203.0.113.8", now);
    await hitRateLimit("otpVerifyIp", "203.0.113.7", now);
    // The next window starts fresh.
    await hitRateLimit("otpRequestIp", "203.0.113.7", new Date("2026-09-26T11:00:00Z"));
  });

  it("parallel requests can't slip past the limit", async () => {
    const now = new Date();
    const results = await Promise.allSettled(Array.from({ length: 30 }, () => hitRateLimit("exportUser", "user-1", now)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(RATE_LIMITS.exportUser.limit);
  });

  it("old windows are pruned by the cron", async () => {
    await hitRateLimit("searchIp", "203.0.113.9", new Date(Date.now() - 2 * 86400_000));
    await hitRateLimit("searchIp", "203.0.113.9");
    expect(await pruneRateLimits()).toBe(1);
    expect(await prisma.rateLimit.count()).toBe(1);
  });
});

describe("error reports", () => {
  it("parses a Sentry DSN into its envelope endpoint", () => {
    expect(parseDsn("https://abc123@o1.ingest.sentry.io/4507")).toMatchObject({ endpoint: "https://o1.ingest.sentry.io/api/4507/envelope/", key: "abc123" });
    expect(parseDsn("not a dsn")).toBeNull();
    expect(parseDsn(undefined)).toBeNull();
  });

  it("CLAUDE.md rule 12: reports carry the path but no query string (codes, phone numbers)", () => {
    expect(safePath("https://dinkuan.et/api/auth/otp/verify?phone=0911000001&code=123456")).toBe("/api/auth/otp/verify");
    const body = sentryEnvelope(new Error("boom"), { path: "/api/checkout", method: "POST" }, "https://k@h/1");
    const [header, item, event] = body.split("\n").map((l) => JSON.parse(l));
    expect(header.dsn).toBe("https://k@h/1");
    expect(item).toEqual({ type: "event" });
    expect(event).toMatchObject({ level: "error", exception: { values: [{ type: "Error", value: "boom" }] }, tags: { path: "/api/checkout", method: "POST" } });
  });
});
