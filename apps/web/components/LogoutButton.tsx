"use client";

import { translator, type Lang } from "@dinkuan/i18n";

export function LogoutButton({ lang }: { lang: Lang }) {
  const t = translator(lang);
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        // Nothing personal stays on the phone after logout: the offline wallet and cached pages.
        try {
          for (const key of ["dk_wallet", "dk_draft", "dk_compare"]) localStorage.removeItem(key);
        } catch {
          // storage unavailable
        }
        if ("caches" in window) {
          await caches
            .keys()
            .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
            .catch(() => undefined);
        }
        window.location.href = "/";
      }}
      className="tap w-full rounded-2xl border border-tent-200 bg-white font-semibold text-tent-700"
    >
      {t("profile.logout")}
    </button>
  );
}
