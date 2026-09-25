import Link from "next/link";
import { translator, type Lang } from "@dinkuan/i18n";
import type { ProfileDTO } from "@/lib/social-types";
import { Avatar } from "./Avatar";
import { LangToggle } from "./LangToggle";

export function Header({ lang, me, unread, inbox = 0 }: { lang: Lang; me: ProfileDTO | null; unread: number; inbox?: number }) {
  const t = translator(lang);
  return (
    <header className="sticky top-0 z-20 border-b border-tent-100 bg-tent-50/95 backdrop-blur">
      <div className="mx-auto flex h-[60px] max-w-2xl items-center justify-between px-4">
        <Link href="/" className="tap flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-tent-600 text-lg font-bold text-white">ድ</span>
          <span className="hidden text-xl font-extrabold text-tent-700 min-[380px]:inline">ድንኳን</span>
        </Link>
        <div className="flex items-center gap-1">
          <LangToggle lang={lang} />
          <Link href="/people" className="tap grid place-items-center rounded-full text-lg" aria-label={t("people.title")}>
            🔍
          </Link>
          {me ? (
            <>
              <Link href="/inbox" className="tap relative grid place-items-center rounded-full text-lg" aria-label={t("inbox.title")}>
                💬
                {inbox > 0 && (
                  <span className="absolute right-0.5 top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
                    {inbox > 9 ? "9+" : inbox}
                  </span>
                )}
              </Link>
              <Link href="/notifications" className="tap relative grid place-items-center rounded-full text-lg" aria-label={t("nav.notifications")}>
                🔔
                {unread > 0 && (
                  <span className="absolute right-0.5 top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
              <Link href={`/u/${me.username}`} className="tap grid place-items-center" aria-label={t("nav.me")}>
                <Avatar profile={me} size={34} />
              </Link>
            </>
          ) : (
            <Link href="/login" className="tap grid place-items-center rounded-full bg-tent-600 px-4 text-sm font-semibold text-white">
              {t("nav.login")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
