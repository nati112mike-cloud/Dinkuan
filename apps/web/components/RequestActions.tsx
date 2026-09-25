"use client";

import { useRouter } from "next/navigation";
import { translator, type Lang } from "@dinkuan/i18n";
import { api } from "@/lib/client";

/** Approve / decline a follow request, or unblock someone. */
export function RequestActions({ lang, userId, mode }: { lang: Lang; userId: string; mode: "request" | "blocked" }) {
  const t = translator(lang);
  const router = useRouter();
  const go = async (url: string, method: "POST" | "DELETE") => {
    await api(url, method === "POST" ? { body: {} } : { method });
    router.refresh();
  };
  if (mode === "blocked") {
    return (
      <button type="button" onClick={() => void go(`/api/users/${userId}/block`, "DELETE")} className="tap rounded-full bg-white px-4 text-sm font-semibold ring-1 ring-tent-200">
        {t("profile.unblock")}
      </button>
    );
  }
  return (
    <span className="flex gap-2">
      <button type="button" onClick={() => void go(`/api/follow-requests/${userId}`, "POST")} className="tap rounded-full bg-tent-600 px-4 text-sm font-semibold text-white">
        {t("settings.approve")}
      </button>
      <button type="button" onClick={() => void go(`/api/follow-requests/${userId}`, "DELETE")} className="tap rounded-full bg-white px-4 text-sm font-semibold ring-1 ring-tent-200">
        {t("settings.decline")}
      </button>
    </span>
  );
}
