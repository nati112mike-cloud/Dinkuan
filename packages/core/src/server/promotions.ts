import { prisma, type AdPlacementKey, type Campaign, type Gateway, type PromoTarget } from "@dinkuan/db";
import { DomainError } from "../errors";
import { audit } from "./audit";
import { appUrl } from "./config";
import { randomToken } from "./crypto";
import { gatewayFor } from "./gateways";
import { appendLedger } from "./ledger";

/**
 * Money side of promotions (F21). A promotion is paid in Birr through the gateway at the moment
 * of purchase (CLAUDE.md rule 13); the platform books it as revenue and refunds any unspent part
 * through the gateway (AC8), so no balance is ever held for the advertiser (rule 4).
 */
export async function startCampaignPayment(input: {
  advertiserId: string;
  packageKey: string;
  targetType: PromoTarget;
  targetId: string;
  placements: AdPlacementKey[];
  budgetSantim: number;
  days: number;
  impressionsGoal: number | null;
  gateway: Gateway;
}): Promise<{ campaign: Campaign; checkoutUrl: string }> {
  if (!Number.isSafeInteger(input.budgetSantim) || input.budgetSantim <= 0) throw new DomainError("VALIDATION");
  const campaign = await prisma.campaign.create({
    data: { ...input, gatewayRef: `dkp_${randomToken(12)}`, status: "pending_payment" },
  });
  const { checkoutUrl } = await gatewayFor(input.gateway).createPayment({
    ref: campaign.gatewayRef,
    amountSantim: campaign.budgetSantim,
    description: `Dinkuan promotion (${input.packageKey})`,
    returnUrl: `${appUrl()}/promote/c/${campaign.id}`,
    notifyUrl: `${appUrl()}/api/webhooks/${input.gateway}`,
  });
  return { campaign, checkoutUrl };
}

/**
 * Marks a promotion paid. Only called after a verified webhook or a server-side verify
 * (CLAUDE.md rule 2). The promotion then waits for ad review (AC5). Idempotent.
 */
export async function markCampaignPaid(campaignId: string, ctx: { source: "webhook" | "verify" }, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const [c] = await tx.$queryRaw<{ status: string }[]>`
      SELECT status FROM campaigns WHERE id = ${campaignId}::uuid FOR UPDATE`;
    if (!c || (c.status !== "pending_payment" && c.status !== "cancelled")) return false;
    const campaign = await tx.campaign.update({
      where: { id: campaignId },
      data: { status: "pending_review", paidAt: now },
    });
    await appendLedger(tx, {
      organiserId: null,
      campaignId,
      type: "promotion",
      amount: campaign.budgetSantim,
      ref: campaign.gatewayRef,
    });
    await audit(
      { action: "campaign.paid", entity: "campaign", entityId: campaignId, before: { status: c.status }, after: { status: "pending_review", source: ctx.source } },
      tx,
    );
    return true;
  });
}

export async function failCampaignPayment(campaignId: string) {
  await prisma.campaign.updateMany({ where: { id: campaignId, status: "pending_payment" }, data: { status: "cancelled" } });
}

/** Server-side verify for the return page and reconciliation. */
export async function verifyCampaignWithGateway(campaignId: string): Promise<Campaign> {
  const c = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (c.status === "pending_payment") {
    const check = await gatewayFor(c.gateway).verify(c.gatewayRef);
    if (check.status === "paid" && check.amountSantim === c.budgetSantim) await markCampaignPaid(c.id, { source: "verify" });
  }
  return prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
}

/**
 * F21-AC4/AC8: budget is spent evenly across the run, so the unspent part is the share of time
 * left. Before the run starts nothing is spent. Integer maths only (CLAUDE.md rule 1).
 */
export function unspentSantim(
  c: Pick<Campaign, "budgetSantim" | "refundedSantim" | "startsAt" | "endsAt">,
  now = new Date(),
): number {
  const left = c.budgetSantim - c.refundedSantim;
  if (!c.startsAt || !c.endsAt || now <= c.startsAt) return left;
  if (now >= c.endsAt) return 0;
  const total = BigInt(c.endsAt.getTime() - c.startsAt.getTime());
  const remaining = BigInt(c.endsAt.getTime() - now.getTime());
  const unspent = Number((BigInt(c.budgetSantim) * remaining) / total);
  return Math.max(0, Math.min(left, unspent));
}

/**
 * Refunds part of a promotion through the gateway and books it in the ledger. A failed gateway
 * refund is audit-logged for an admin to handle and reported as REFUND_FAILED.
 */
export async function refundCampaign(campaignId: string, amountSantim: number, reason: string, actorUserId: string | null) {
  const c = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  const amount = Math.min(amountSantim, c.budgetSantim - c.refundedSantim);
  if (amount <= 0 || !c.paidAt) return 0;
  const res = await gatewayFor(c.gateway)
    .refund(c.gatewayRef, amount, reason)
    .catch(() => ({ ok: false, refundRef: undefined }));
  if (!res.ok) {
    await audit({ actorUserId, action: "campaign.refund_failed", entity: "campaign", entityId: campaignId, after: { amount, reason } });
    throw new DomainError("REFUND_FAILED");
  }
  await prisma.$transaction(async (tx) => {
    await tx.campaign.update({ where: { id: campaignId }, data: { refundedSantim: { increment: amount } } });
    await appendLedger(tx, {
      organiserId: null,
      campaignId,
      type: "promotion_refund",
      amount: -amount,
      ref: res.refundRef ?? c.gatewayRef,
    });
    await audit(
      { actorUserId, action: "campaign.refund", entity: "campaign", entityId: campaignId, after: { amount, reason, refundRef: res.refundRef } },
      tx,
    );
  });
  return amount;
}
