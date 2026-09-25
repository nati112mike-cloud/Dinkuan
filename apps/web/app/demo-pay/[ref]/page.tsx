import { notFound } from "next/navigation";
import { isDemoMode } from "@dinkuan/core/server";
import { prisma } from "@dinkuan/db";
import { DemoPayForm } from "@/components/DemoPayForm";

export const dynamic = "force-dynamic";

/**
 * Stand-in for the gateway's hosted payment page while merchant accounts are pending.
 * Deliberately plain and clearly labelled as a simulation; it uses no gateway branding.
 */
export default async function DemoPayPage({ params }: { params: Promise<{ ref: string }> }) {
  if (!isDemoMode()) notFound();
  const { ref } = await params;
  const payment = await prisma.demoPayment.findUnique({ where: { ref } });
  const order = await prisma.order.findUnique({ where: { gatewayRef: ref } });
  if (!payment || !order) notFound();
  return (
    <DemoPayForm
      refId={ref}
      orderId={order.id}
      gateway={payment.gateway}
      amountSantim={payment.amountSantim}
      description={payment.description}
      status={payment.status}
    />
  );
}
