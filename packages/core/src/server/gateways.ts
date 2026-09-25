import { prisma, type Gateway } from "@dinkuan/db";
import {
  ChapaGateway,
  DemoGateway,
  TelebirrGateway,
  type DemoPaymentStore,
  type PaymentGateway,
} from "@dinkuan/payments";
import { appUrl, isDemoMode } from "./config";

export const demoPaymentStore: DemoPaymentStore = {
  async create(p) {
    await prisma.demoPayment.create({ data: p });
  },
  async get(ref) {
    return prisma.demoPayment.findUnique({ where: { ref } });
  },
  async setStatus(ref, status) {
    await prisma.demoPayment.update({ where: { ref }, data: { status } });
  },
  async addRefund(ref, amount) {
    await prisma.demoPayment.update({ where: { ref }, data: { refundedSantim: { increment: amount } } });
  },
};

export function webhookSecret(): string {
  const s = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!s) throw new Error("PAYMENT_WEBHOOK_SECRET is not set");
  return s;
}

const overrides = new Map<Gateway, PaymentGateway>();

/** Tests can swap in a fake gateway. */
export function setGatewayOverride(name: Gateway, gw: PaymentGateway | null) {
  if (gw) overrides.set(name, gw);
  else overrides.delete(name);
}

export function gatewayFor(name: Gateway): PaymentGateway {
  const o = overrides.get(name);
  if (o) return o;
  if (isDemoMode()) {
    return new DemoGateway(name, { store: demoPaymentStore, secret: webhookSecret(), appUrl: appUrl() });
  }
  return name === "telebirr" ? new TelebirrGateway() : new ChapaGateway();
}
