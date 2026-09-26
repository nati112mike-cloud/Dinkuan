import { expect, test } from "@playwright/test";
import { freshPhone } from "./helpers";

/** Launch hardening: security headers, health check and per-IP rate limits. */
test("pages and APIs send security headers", async ({ request }) => {
  for (const path of ["/", "/api/health"]) {
    const res = await request.get(path);
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"]).toContain("object-src 'none'");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["x-powered-by"]).toBeUndefined();
  }
});

test("the health check reports the database is reachable", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect((await res.json()).data).toMatchObject({ status: "ok", db: "ok" });
});

test("one IP asking for too many login codes is slowed down", async ({ request }) => {
  const ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}, 10.0.0.${Math.floor(Math.random() * 250) + 1}`;
  const statuses: number[] = [];
  for (let i = 0; i < 11; i++) {
    const res = await request.post("/api/auth/otp/request", { data: { phone: freshPhone().slice(0, 8) + String(i).padStart(2, "0") }, headers: { "x-forwarded-for": ip } });
    statuses.push(res.status());
    if (res.status() === 429) {
      expect(Number(res.headers()["retry-after"])).toBeGreaterThan(0);
      expect((await res.json()).error.code).toBe("RATE_LIMITED");
    }
  }
  expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
  expect(statuses[10]).toBe(429);
});

test("S16: the first page load gives a browser its visitor id, but API calls don't", async ({ request }) => {
  const page = await request.get("/events", { maxRedirects: 0 });
  expect(page.headers()["set-cookie"] ?? "").toMatch(/dk_vid=v_[0-9a-f-]{36}/);
  const api = await request.get("/api/health");
  expect(api.headers()["set-cookie"] ?? "").not.toContain("dk_vid");
});
