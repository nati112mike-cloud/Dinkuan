import type { LedgerType, Prisma } from "@dinkuan/db";

type Tx = Prisma.TransactionClient;

/**
 * Appends a ledger row (CLAUDE.md rule 6). The ledger is append-only; each row carries the
 * running balance of its organiser, or of the platform when organiserId is null.
 */
export async function appendLedger(
  tx: Tx,
  e: {
    organiserId: string | null;
    orderId?: string | null;
    campaignId?: string | null;
    type: LedgerType;
    amount: number;
    ref: string;
  },
) {
  // Serialise per organiser (or the platform) so balance_after is a true running balance.
  const key = e.organiserId ?? "platform";
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"ledger:" + key}))`;
  const last = await tx.ledgerEntry.findFirst({
    where: { organiserId: e.organiserId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  await tx.ledgerEntry.create({
    data: {
      organiserId: e.organiserId,
      orderId: e.orderId ?? null,
      campaignId: e.campaignId ?? null,
      type: e.type,
      amountSantim: e.amount,
      balanceAfterSantim: (last?.balanceAfterSantim ?? 0) + e.amount,
      ref: e.ref,
    },
  });
}

/**
 * F21-AC7: credits a promotion with a conversion (a ticket sale or a booking request). Each
 * (campaign, type, ref) counts once, so retries and duplicate webhooks don't inflate results.
 */
export async function recordAdConversion(tx: Tx, campaignId: string, type: "ticket_sale" | "booking_request" | "follow", refId: string) {
  const created = await tx.adConversion.createMany({ data: [{ campaignId, type, refId }], skipDuplicates: true });
  if (created.count) await tx.campaign.update({ where: { id: campaignId }, data: { conversions: { increment: 1 } } });
}
