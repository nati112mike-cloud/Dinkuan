/**
 * One interface for every payment gateway (CLAUDE.md "Stack": packages/payments).
 * Amounts are integer santim. Payment state is trusted only from parseWebhook (signature
 * checked) or verify (server-to-server), never from a client redirect.
 */
export type GatewayName = "telebirr" | "chapa";

export interface CreatePaymentInput {
  ref: string;
  amountSantim: number;
  description: string;
  returnUrl: string;
  notifyUrl: string;
}

export type RemotePaymentStatus = "pending" | "paid" | "failed";

export interface WebhookResult {
  ref: string;
  type: string;
  status: RemotePaymentStatus;
  amountSantim: number;
  raw: unknown;
}

export interface PaymentGateway {
  readonly name: GatewayName;
  createPayment(input: CreatePaymentInput): Promise<{ checkoutUrl: string }>;
  verify(ref: string): Promise<{ status: RemotePaymentStatus; amountSantim: number }>;
  /** Throws WebhookSignatureError when the signature does not match. */
  parseWebhook(rawBody: string, headers: Record<string, string | undefined>): Promise<WebhookResult>;
  refund(ref: string, amountSantim: number, reason: string): Promise<{ ok: boolean; refundRef?: string }>;
}

export class WebhookSignatureError extends Error {
  constructor() {
    super("Webhook signature invalid");
    this.name = "WebhookSignatureError";
  }
}

export class GatewayNotConfiguredError extends Error {
  constructor(name: GatewayName) {
    super(`${name} is not configured yet. Set DEMO_MODE=true to use the demo gateway.`);
    this.name = "GatewayNotConfiguredError";
  }
}
