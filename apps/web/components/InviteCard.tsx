"use client";

import { useState } from "react";
import { translator, type Lang } from "@dinkuan/i18n";

/** F17-AC5: invite friends via Telegram or SMS with a referral link. */
export function InviteCard({ lang, code }: { lang: Lang; code: string }) {
  const t = translator(lang);
  const [copied, setCopied] = useState(false);
  const link = () => `${window.location.origin}/join/${code}`;
  const message = () => t("people.inviteMessage", { url: link() });
  return (
    <section className="space-y-2 rounded-2xl bg-tent-600 p-4 text-white">
      <h2 className="font-bold">🎉 {t("people.invite")}</h2>
      <p className="text-sm text-tent-100">{t("people.inviteHint")}</p>
      <div className="flex flex-wrap gap-2">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            window.open(`https://t.me/share/url?url=${encodeURIComponent(link())}&text=${encodeURIComponent(message())}`, "_blank");
          }}
          className="tap grid place-items-center rounded-full bg-white px-4 text-sm font-semibold text-tent-700"
        >
          ✈️ Telegram
        </a>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            window.location.href = `sms:?&body=${encodeURIComponent(message())}`;
          }}
          className="tap grid place-items-center rounded-full bg-white px-4 text-sm font-semibold text-tent-700"
        >
          ✉️ SMS
        </a>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard?.writeText(link()).catch(() => undefined);
            setCopied(true);
          }}
          className="tap rounded-full bg-tent-700 px-4 text-sm font-semibold"
        >
          🔗 {copied ? t("post.linkCopied") : t("post.copyLink")}
        </button>
      </div>
    </section>
  );
}
