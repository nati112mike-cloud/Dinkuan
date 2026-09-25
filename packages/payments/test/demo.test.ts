import { describe, expect, it } from "vitest";
import { DemoGateway, signDemoWebhook, WebhookSignatureError, type DemoPaymentStore } from "../src";

function memoryStore(): DemoPaymentStore {
  const m = new Map<string, { status: string; amountSantim: number; refundedSantim: number }>();
  return {
    async create(p) {
      m.set(p.ref, { status: "pending", amountSantim: p.amountSantim, refundedSantim: 0 });
    },
    async get(ref) {
      return m.get(ref) ?? null;
    },
    async setStatus(ref, status) {
      m.get(ref)!.status = status;
    },
    async addRefund(ref, amount) {
      m.get(ref)!.refundedSantim += amount;
    },
  };
}

describe("DemoGateway", () => {
  const secret = "test-secret";

  it("rejects a webhook with a bad signature", async () => {
    const gw = new DemoGateway("telebirr", { store: memoryStore(), secret, appUrl: "http://x" });
    const body = JSON.stringify({ ref: "r1", event: "payment.succeeded", amount_santim: 100 });
    await expect(gw.parseWebhook(body, { "x-demo-signature": "00" })).rejects.toBeInstanceOf(
      WebhookSignatureError,
    );
  });

  it("accepts a correctly signed webhook", async () => {
    const gw = new DemoGateway("chapa", { store: memoryStore(), secret, appUrl: "http://x" });
    const body = JSON.stringify({ ref: "r1", event: "payment.succeeded", amount_santim: 100 });
    const res = await gw.parseWebhook(body, { "x-demo-signature": signDemoWebhook(body, secret) });
    expect(res).toMatchObject({ ref: "r1", status: "paid", amountSantim: 100 });
  });

  it("never refunds more than was paid", async () => {
    const store = memoryStore();
    const gw = new DemoGateway("telebirr", { store, secret, appUrl: "http://x" });
    await gw.createPayment({ ref: "r2", amountSantim: 1000, description: "", returnUrl: "", notifyUrl: "" });
    expect((await gw.refund("r2", 500, "x")).ok).toBe(false); // not paid yet
    await store.setStatus("r2", "paid");
    expect((await gw.refund("r2", 600, "x")).ok).toBe(true);
    expect((await gw.refund("r2", 600, "x")).ok).toBe(false);
  });
});
