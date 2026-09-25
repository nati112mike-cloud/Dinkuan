"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { translator, type Lang, type MessageKey } from "@dinkuan/i18n";

const items: { href: string; key: MessageKey; icon: string }[] = [
  { href: "/", key: "nav.home", icon: "🏠" },
  { href: "/events", key: "nav.events", icon: "🎟" },
  { href: "/tickets", key: "nav.tickets", icon: "🎫" },
  { href: "/profile", key: "nav.profile", icon: "👤" },
];

export function BottomNav({ lang }: { lang: Lang }) {
  const t = translator(lang);
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-tent-100 bg-white/95 backdrop-blur">
      <ul className="mx-auto grid max-w-2xl grid-cols-4">
        {items.map((it) => {
          const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                className={`tap flex flex-col items-center gap-0.5 py-2 text-xs ${active ? "font-bold text-tent-600" : "text-stone-500"}`}
              >
                <span className="text-lg" aria-hidden>
                  {it.icon}
                </span>
                {t(it.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
