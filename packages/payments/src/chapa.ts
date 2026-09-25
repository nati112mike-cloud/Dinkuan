import { GatewayNotConfiguredError, type PaymentGateway } from "./types";

/**
 * Chapa hosted checkout adapter. Placeholder until the merchant account is live:
 * initialize, webhook signature (HMAC with CHAPA_WEBHOOK_SECRET), verify and refund go here.
 */
export class ChapaGateway implements PaymentGateway {
  readonly name = "chapa" as const;
  async createPayment(): Promise<never> {
    throw new GatewayNotConfiguredError(this.name);
  }
  async verify(): Promise<never> {
    throw new GatewayNotConfiguredError(this.name);
  }
  async parseWebhook(): Promise<never> {
    throw new GatewayNotConfiguredError(this.name);
  }
  async refund(): Promise<never> {
    throw new GatewayNotConfiguredError(this.name);
  }
}
