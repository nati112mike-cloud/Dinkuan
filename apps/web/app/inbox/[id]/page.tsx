import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DomainError } from "@dinkuan/core";
import { getConversation } from "@dinkuan/marketplace";
import { Chat } from "@/components/Chat";
import { toChatDTO } from "@/lib/chat";
import { currentUser, getT } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Chat" };

/** F20-AC15: request chat. Contact details stay masked until a deposit is paid. */
export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect(`/login?next=/inbox/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const convo = await getConversation(user.id, id).catch((e) => {
    if (e instanceof DomainError) return null;
    throw e;
  });
  if (!convo) notFound();
  const { lang } = await getT();
  return <Chat lang={lang} initial={toChatDTO(convo)} />;
}
