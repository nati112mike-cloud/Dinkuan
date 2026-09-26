import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { MessageKey } from "@dinkuan/i18n";
import { listNotifications, markAllRead } from "@dinkuan/social";
import { Avatar } from "@/components/Avatar";
import { timeAgo } from "@/lib/client";
import { currentUser, getT } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/notifications");
  const { lang, t } = await getT();
  const items = await listNotifications(user.id);
  await markAllRead(user.id);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">{t("notif.title")}</h1>
      {items.length === 0 ? (
        <p className="text-stone-500">{t("notif.none")}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => {
            // Moderation notices come from ድንኳን itself, never from a named moderator.
            const system = n.type.startsWith("mod_") || n.type.startsWith("appeal_");
            const p = n.actor.profile;
            const name = system ? t("notif.system") : (p?.username ?? "member");
            const href = n.href ?? (n.postId ? `/p/${n.postId}` : n.type === "follow_request" ? "/settings#requests" : `/u/${name}`);
            return (
              <li key={n.id}>
                <Link href={href} className={`flex items-center gap-3 rounded-2xl p-3 ring-1 ring-tent-100 ${n.readAt ? "bg-white" : "bg-tent-100"}`}>
                  <Avatar profile={{ username: name, displayName: system ? name : p?.displayName || name, avatarUrl: system ? null : (p?.avatarUrl ?? null) }} size={40} />
                  <p className="min-w-0 flex-1 text-sm">
                    <span className="font-bold">{system ? name : `@${name}`}</span> {t(`notif.${n.type}` as MessageKey)}{" "}
                    <span className="text-stone-500">· {timeAgo(n.createdAt.toISOString(), lang)}</span>
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
