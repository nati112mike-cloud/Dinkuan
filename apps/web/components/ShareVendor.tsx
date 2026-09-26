"use client";

import { translator, type Lang } from "@dinkuan/i18n";

/** Share a vendor or a shortlist on Telegram, where families plan weddings together (F20-AC13). */
export function TelegramShare({ lang, path, text, label }: { lang: Lang; path: string; text: string; label?: string }) {
  const t = translator(lang);
  const share = () => {
    const url = `${window.location.origin}${path}`;
    window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };
  return (
    <button type="button" onClick={share} className="tap grid place-items-center rounded-full bg-sky-600 px-4 text-sm font-semibold text-white">
      ✈ {label ?? t("share.telegram")}
    </button>
  );
}

export function ShareVendor({ lang, username, name }: { lang: Lang; username: string; name: string }) {
  return <TelegramShare lang={lang} path={`/hire/v/${username}`} text={name} />;
}
