import { prisma } from "@dinkuan/db";
import { audit } from "./audit";
import { gatewayFor } from "./gateways";
import { appendLedger } from "./ledger";

/**
 * Takes the refund for one order, so only one caller ever reaches the gateway (a double click,
 * an admin retry during an event cancellation). A refund still in flight blocks another one.
 * Returns the pending Refund row, or null if the order can't be refunded right now.
 */
async function claimRefund(orderId: string, reason: string, actorId: string | null) {
  return prisma.$transaction(async (tx) => {
    const [o] = await tx.$queryRaw<{ status: string; total_santim: number }[]>`
      SELECT status, total_santim FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
    if (!o || (o.status !== "paid" && o.status !== "refund_pending")) return null;
    if (await tx.refund.findFirst({ where: { orderId, status: { in: ["pending", "done"] } } })) return null;
    await tx.order.update({ where: { id: orderId }, data: { status: "refund_pending" } });
    return tx.refund.create({ data: { orderId, amountSantim: o.total_santim, reason, status: "pending", createdBy: actorId } });
  });
}

/**
 * Refunds one order in full (ticket price and fee) through the gateway, voids its tickets and
 * reverses exactly the ledger rows the order booked. An order refunded before it ever booked a
 * sale (paid after its reservation lapsed on a sold-out event) writes no ledger rows. Returns
 * false, and leaves the order refund_pending for an admin, when the gateway refuses (F9-AC5).
 */
export async function refundOrderInFull(orderId: string, reason: string, actorId: string | null) {
  const claim = await claimRefund(orderId, reason, actorId);
  if (!claim) return false;
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { event: true } });
  const res =
    order.totalSantim === 0
      ? { ok: true, refundRef: undefined }
      : await gatewayFor(order.gateway)
          .refund(order.gatewayRef, order.totalSantim, reason)
          .catch(() => ({ ok: false, refundRef: undefined }));
  await prisma.$transaction(async (tx) => {
    await tx.refund.update({ where: { id: claim.id }, data: { status: res.ok ? "done" : "failed", gatewayRef: res.refundRef ?? null } });
    if (!res.ok) {
      await audit({ actorUserId: actorId, action: "order.refund_failed", entity: "order", entityId: orderId, after: { reason } }, tx);
      return;
    }
    await tx.order.update({ where: { id: orderId }, data: { status: "refunded" } });
    await tx.ticket.updateMany({ where: { orderId }, data: { status: order.totalSantim === 0 ? "void" : "refunded" } });
    const booked = await tx.ledgerEntry.groupBy({ by: ["organiserId"], where: { orderId, type: { in: ["sale", "fee"] } }, _sum: { amountSantim: true } });
    const ref = res.refundRef ?? order.gatewayRef;
    for (const b of booked) {
      const amount = b._sum.amountSantim ?? 0;
      if (amount > 0) await appendLedger(tx, { organiserId: b.organiserId, orderId, type: "refund", amount: -amount, ref });
    }
    await audit({ actorUserId: actorId, action: "order.refund", entity: "order", entityId: orderId, after: { amount: order.totalSantim, reason, refundRef: res.refundRef } }, tx);
  });
  return res.ok;
}
