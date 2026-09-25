"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { translator, type Lang } from "@dinkuan/i18n";
import { api, errorText } from "@/lib/client";
import { compressImage, inspectVideo, uploadResumable } from "@/lib/upload";

/** F20-AC2: an album of photos and videos grouped by project, optionally tagged to an event. */
export function AlbumForm({ lang, events }: { lang: Lang; events: { id: string; title: string }[] }) {
  const t = translator(lang);
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [eventId, setEventId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const field = "tap w-full rounded-xl border border-tent-200 bg-white px-3";

  const submit = async () => {
    setError(null);
    try {
      const items: { blobId: string; thumbBlobId?: string; width: number; height: number }[] = [];
      for (const [i, f] of files.entries()) {
        setStatus(`${i + 1}/${files.length}`);
        if (f.type.startsWith("video/")) {
          const info = await inspectVideo(f);
          const blobId = await uploadResumable(f, f.type || "video/mp4", () => undefined, () => undefined);
          const thumbBlobId = info.thumb ? await uploadResumable(info.thumb.blob, info.thumb.contentType, () => undefined, () => undefined) : undefined;
          items.push({ blobId, thumbBlobId, width: info.width, height: info.height });
        } else {
          const p = await compressImage(f);
          items.push({ blobId: await uploadResumable(p.blob, p.contentType, () => undefined, () => undefined), width: p.width, height: p.height });
        }
      }
      const r = await api("/api/vendor/albums", { body: { title, eventId: eventId || null, items } });
      if (!r.ok) throw Object.assign(new Error(r.code), { code: r.code });
      setTitle("");
      setEventId("");
      setFiles([]);
      router.refresh();
    } catch (e) {
      setError(errorText(lang, (e as { code?: string }).code ?? "generic"));
    }
    setStatus(null);
  };

  return (
    <form
      className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-tent-100"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <input required minLength={2} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("portfolio.titlePlaceholder")} aria-label={t("portfolio.title")} className={field} />
      <label className="block space-y-1 text-xs font-semibold text-stone-600">
        {t("portfolio.tagEvent")}
        <select value={eventId} onChange={(e) => setEventId(e.target.value)} className={field}>
          <option value="">{t("create.noEvent")}</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </select>
        <span className="block font-normal">{t("portfolio.tagHint")}</span>
      </label>
      <label className="tap grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-tent-200 p-4 font-semibold text-tent-700">
        📷 {files.length ? t("portfolio.selected", { n: files.length }) : t("portfolio.addMedia")}
        <input type="file" accept="image/*,video/*" multiple className="sr-only" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 30))} />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={!files.length || !title || !!status} className="tap w-full rounded-2xl bg-tent-600 font-bold text-white disabled:opacity-50">
        {status ? `${t("create.posting")} ${status}` : t("portfolio.save")}
      </button>
    </form>
  );
}
