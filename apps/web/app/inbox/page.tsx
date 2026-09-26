import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listConversations } from "@dinkuan/marketplace";
import { Avatar } from "@/components/Avatar";
import { timeAgo } from "@/lib/client";
import { currentUser, getT } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inbox" };

/** Marketplace inbox: booking requests you sent (client) and received (vendor). */
export default async function InboxPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/inbox");
  const { lang, t } = await getT();
  const list = await listConversations(user.id);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">💬 {t("inbox.title")}</h1>
      {list.length === 0 ? (
        <p className="py-6 text-center text-stone-500">
          {t("inbox.empty")}{" "}
          <a href="/hire" className="font-semibold text-tent-600">
            {t("hire.title")} →
          </a>
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((c) => {
            const name = c.other?.displayName || c.other?.username || "—";
            return (
              <li key={c.id}>
                <Link href={`/inbox/${c.id}`} className={`flex items-center gap-3 rounded-2xl p-3 ring-1 ring-tent-100 ${c.unread ? "bg-tent-100" : "bg-white"}`}>
                  <Avatar profile={{ username: c.other?.username ?? "member", displayName: name, avatarUrl: c.other?.avatarUrl ?? null }} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-bold">{name}</span>
                      <span className="shrink-0 text-xs text-stone-500">{timeAgo(c.lastMessageAt.toISOString(), lang)}</span>
                    </span>
                    <span className="block truncate text-xs font-semibold text-tent-700">
                      {c.asVendor ? t("inbox.asVendor") : t("inbox.asClient")} · {c.request.eventType} · {c.request.eventDate.toISOString().slice(0, 10)}
                      {c.request.status === "cancelled" && ` · ${t("inbox.declined")}`}
                    </span>
                    <span className="block truncate text-sm text-stone-600">
                      {c.lastMessage ? `${c.lastMessage.mine ? `${t("inbox.you")}: ` : ""}${c.lastMessage.body}` : t("inbox.newRequest")}
                    </span>
                  </span>
                  {c.unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-tent-600" aria-label={t("inbox.unread")} />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
