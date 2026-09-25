import { TicketView } from "@/components/TicketView";
import { getT } from "@/lib/session";

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { lang } = await getT();
  return <TicketView lang={lang} ticketId={id} />;
}
