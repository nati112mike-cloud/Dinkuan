import { redirect } from "next/navigation";
import { prisma } from "@dinkuan/db";
import { OrderStatus } from "@/components/OrderStatus";
import { currentUser, getT } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect(`/login?next=/orders/${id}`);
  const order = await prisma.order.findUnique({ where: { id }, include: { event: true } });
  if (!order || order.userId !== user.id) redirect("/tickets");
  const { lang } = await getT();
  return <OrderStatus lang={lang} orderId={order.id} initial={order.status} number={order.number} eventSlug={order.event.slug} needsName={!user.name} />;
}
