import { GatewayNotConfiguredError, type PaymentGateway } from "./types";

/**
 * Telebirr H5 C2B adapter. Placeholder until merchant credentials are issued:
 * signed requests (RSA), notify callback verification and the query API go here.
 */
export class TelebirrGateway implements PaymentGateway {
  readonly name = "telebirr" as const;
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
