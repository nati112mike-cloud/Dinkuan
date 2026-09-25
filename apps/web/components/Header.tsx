import Link from "next/link";
import { translator, type Lang } from "@dinkuan/i18n";
import { LangToggle } from "./LangToggle";

export function Header({ lang, loggedIn }: { lang: Lang; loggedIn: boolean }) {
  const t = translator(lang);
  return (
    <header className="sticky top-0 z-20 border-b border-tent-100 bg-tent-50/95 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-2">
        <Link href="/" className="tap flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-tent-600 text-lg font-bold text-white">ድ</span>
          <span className="text-xl font-extrabold text-tent-700">ድንኳን</span>
        </Link>
        <div className="flex items-center gap-2">
          <LangToggle lang={lang} />
          {!loggedIn && (
            <Link href="/login" className="tap grid place-items-center rounded-full bg-tent-600 px-4 text-sm font-semibold text-white">
              {t("nav.login")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
