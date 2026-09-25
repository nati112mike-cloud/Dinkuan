"use client";

import { translator, type Lang } from "@dinkuan/i18n";

export function LogoutButton({ lang }: { lang: Lang }) {
  const t = translator(lang);
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        try {
          localStorage.removeItem("dk_wallet");
        } catch {
          // storage unavailable
        }
        window.location.href = "/";
      }}
      className="tap w-full rounded-2xl border border-tent-200 bg-white font-semibold text-tent-700"
    >
      {t("profile.logout")}
    </button>
  );
}
