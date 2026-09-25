import { createHmac, timingSafeEqual } from "node:crypto";
import {
  WebhookSignatureError,
  type CreatePaymentInput,
  type GatewayName,
  type PaymentGateway,
  type RemotePaymentStatus,
  type WebhookResult,
} from "./types";

/**
 * Demo stand-in for Telebirr and Chapa. It behaves like a real hosted checkout:
 * the buyer is sent to a payment page, the "gateway" signs a webhook (HMAC-SHA256),
 * and the server can verify a payment server-to-server. Its state lives in a store
 * the app provides (the demo_payments table), standing in for the gateway's own database.
 */
export interface DemoPaymentStore {
  create(p: { ref: string; gateway: GatewayName; amountSantim: number; description: string }): Promise<void>;
  get(ref: string): Promise<{ status: string; amountSantim: number; refundedSantim: number } | null>;
  setStatus(ref: string, status: RemotePaymentStatus): Promise<void>;
  addRefund(ref: string, amountSantim: number): Promise<void>;
}

export const DEMO_SIGNATURE_HEADER = "x-demo-signature";

export function signDemoWebhook(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export interface DemoWebhookBody {
  ref: string;
  event: "payment.succeeded" | "payment.failed";
  amount_santim: number;
}

export class DemoGateway implements PaymentGateway {
  constructor(
    public readonly name: GatewayName,
    private readonly opts: { store: DemoPaymentStore; secret: string; appUrl: string },
  ) {}

  async createPayment(input: CreatePaymentInput) {
    await this.opts.store.create({
      ref: input.ref,
      gateway: this.name,
      amountSantim: input.amountSantim,
      description: input.description,
    });
    return { checkoutUrl: `${this.opts.appUrl}/demo-pay/${encodeURIComponent(input.ref)}` };
  }

  async verify(ref: string) {
    const p = await this.opts.store.get(ref);
    if (!p) return { status: "failed" as const, amountSantim: 0 };
    return { status: p.status as RemotePaymentStatus, amountSantim: p.amountSantim };
  }

  async parseWebhook(rawBody: string, headers: Record<string, string | undefined>): Promise<WebhookResult> {
    const given = headers[DEMO_SIGNATURE_HEADER] ?? "";
    const expected = signDemoWebhook(rawBody, this.opts.secret);
    const a = Buffer.from(given, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new WebhookSignatureError();
    const body = JSON.parse(rawBody) as DemoWebhookBody;
    return {
      ref: body.ref,
      type: body.event,
      status: body.event === "payment.succeeded" ? "paid" : "failed",
      amountSantim: body.amount_santim,
      raw: body,
    };
  }

  async refund(ref: string, amountSantim: number, _reason: string) {
    const p = await this.opts.store.get(ref);
    if (!p || p.status !== "paid" || p.refundedSantim + amountSantim > p.amountSantim) return { ok: false };
    await this.opts.store.addRefund(ref, amountSantim);
    return { ok: true, refundRef: `demo-refund-${ref}-${p.refundedSantim + amountSantim}` };
  }
}
