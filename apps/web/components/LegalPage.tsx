import Link from "next/link";
import type { MessageKey } from "@dinkuan/i18n";

type T = (k: MessageKey, v?: Record<string, string | number>) => string;

/** Shared layout for the privacy policy and terms (am/en, PRD 3 data protection). */
export function LegalPage({ t, title, intro, sections }: { t: T; title: MessageKey; intro: MessageKey; sections: { title?: MessageKey; items: MessageKey[] }[] }) {
  return (
    <article className="space-y-4">
      <h1 className="text-2xl font-extrabold">{t(title)}</h1>
      <p className="text-xs text-stone-500">{t("legal.updated")}</p>
      <p className="text-stone-700">{t(intro)}</p>
      {sections.map((s, i) => (
        <section key={i} className="space-y-2">
          {s.title && <h2 className="text-lg font-bold">{t(s.title)}</h2>}
          <ul className="list-inside list-disc space-y-2 text-stone-700">
            {s.items.map((k) => (
              <li key={k}>{t(k)}</li>
            ))}
          </ul>
        </section>
      ))}
      <LegalLinks t={t} />
    </article>
  );
}

export function LegalLinks({ t }: { t: T }) {
  return (
    <nav className="flex gap-4 pt-2 text-sm font-semibold text-tent-700">
      <Link href="/terms">{t("legal.terms")}</Link>
      <Link href="/privacy">{t("legal.privacy")}</Link>
      <Link href="/guidelines">{t("legal.guidelines")}</Link>
    </nav>
  );
}
