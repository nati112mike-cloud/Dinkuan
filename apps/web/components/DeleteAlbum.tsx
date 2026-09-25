"use client";

import { useRouter } from "next/navigation";
import { translator, type Lang } from "@dinkuan/i18n";
import { api } from "@/lib/client";

export function DeleteAlbum({ lang, albumId }: { lang: Lang; albumId: string }) {
  const t = translator(lang);
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label={t("post.delete")}
      className="tap grid place-items-center px-2 text-lg"
      onClick={async () => {
        if (!window.confirm(t("portfolio.deleteConfirm"))) return;
        const r = await api(`/api/vendor/albums/${albumId}`, { method: "DELETE" });
        if (r.ok) router.refresh();
      }}
    >
      🗑
    </button>
  );
}
