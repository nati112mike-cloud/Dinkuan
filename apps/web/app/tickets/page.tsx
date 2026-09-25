import { Wallet } from "@/components/Wallet";
import { getT } from "@/lib/session";

export default async function TicketsPage() {
  const { lang } = await getT();
  return <Wallet lang={lang} />;
}
