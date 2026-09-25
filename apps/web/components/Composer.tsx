"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { translator, type Lang } from "@dinkuan/i18n";
import { api, errorText } from "@/lib/client";
import { compressImage, inspectVideo, renderMeme, uploadResumable, type Prepared } from "@/lib/upload";

type Kind = "text" | "photo" | "meme" | "video";
type Draft = { kind: Kind; caption: string; audience: "public" | "followers"; eventId: string; top: string; bottom: string };
const DRAFT_KEY = "dk_draft";
const MAX_PHOTOS = 10;
const MAX_VIDEO_S = 180;

function readDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

/** F15: create a post: text, photos (1–10), meme editor or video; tag an event; drafts stay on the phone. */
export function Composer({ lang, events, initialEventId }: { lang: Lang; events: { id: string; title: string }[]; initialEventId: string | null }) {
  const t = translator(lang);
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("text");
  const [caption, setCaption] = useState("");
  const [audience, setAudience] = useState<"public" | "followers">("public");
  const [eventId, setEventId] = useState(initialEventId ?? "");
  const [photos, setPhotos] = useState<File[]>([]);
  const [memeImage, setMemeImage] = useState<File | null>(null);
  const [top, setTop] = useState("");
  const [bottom, setBottom] = useState("");
  const [video, setVideo] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState(false);
  const memeCanvas = useRef<HTMLCanvasElement>(null);
  const previews = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos]);
  const videoUrl = useMemo(() => (video ? URL.createObjectURL(video) : null), [video]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  useEffect(() => () => void (videoUrl && URL.revokeObjectURL(videoUrl)), [videoUrl]);
  const loaded = useRef(false);

  // F15-AC8: drafts are saved on the device.
  useEffect(() => {
    const d = readDraft();
    if (d && (d.caption || d.top || d.bottom)) {
      setKind(d.kind);
      setCaption(d.caption);
      setAudience(d.audience);
      if (!initialEventId) setEventId(d.eventId);
      setTop(d.top);
      setBottom(d.bottom);
      setRestored(true);
    }
    loaded.current = true;
  }, [initialEventId]);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      if (caption || top || bottom) localStorage.setItem(DRAFT_KEY, JSON.stringify({ kind, caption, audience, eventId, top, bottom } satisfies Draft));
      else localStorage.removeItem(DRAFT_KEY);
    } catch {
      // storage full or blocked: drafts are a convenience
    }
  }, [kind, caption, audience, eventId, top, bottom]);

  useEffect(() => {
    if (kind !== "meme" || !memeImage || !memeCanvas.current) return;
    void renderMeme(memeImage, top, bottom, memeCanvas.current);
  }, [kind, memeImage, top, bottom]);

  const discard = () => {
    setCaption("");
    setTop("");
    setBottom("");
    setRestored(false);
  };

  const upload = async (p: Prepared, part: string) => {
    return uploadResumable(
      p.blob,
      p.contentType,
      (sent, total) => setStatus(`${part}${t("create.uploading", { pct: Math.round((sent / total) * 100) })}`),
      () => setStatus(t("create.retrying")),
    );
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const media: { blobId: string; thumbBlobId?: string; width: number; height: number; durationS?: number }[] = [];
      if (kind === "photo") {
        for (const [i, f] of photos.entries()) {
          const p = await compressImage(f);
          media.push({ blobId: await upload(p, photos.length > 1 ? `${i + 1}/${photos.length} · ` : ""), width: p.width, height: p.height });
        }
      } else if (kind === "meme" && memeImage) {
        const p = await renderMeme(memeImage, top, bottom);
        media.push({ blobId: await upload(p, ""), width: p.width, height: p.height });
      } else if (kind === "video" && video) {
        const info = await inspectVideo(video);
        if (info.durationS > MAX_VIDEO_S) throw Object.assign(new Error("long"), { message: t("create.videoTooLong") });
        const blobId = await upload({ blob: video, contentType: video.type || "video/mp4", width: info.width, height: info.height }, "");
        const thumbBlobId = info.thumb ? await upload(info.thumb, "") : undefined;
        media.push({ blobId, thumbBlobId, width: info.width, height: info.height, durationS: info.durationS });
      }
      setStatus(t("create.posting"));
      const type = kind === "video" ? (video && media[0] && media[0].height > media[0].width ? "reel" : "video") : kind;
      const r = await api<{ id: string }>("/api/posts", { body: { type, caption, audience, eventId: eventId || null, media } });
      if (!r.ok) throw Object.assign(new Error(r.code), { code: r.code });
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // ignore
      }
      router.push(type === "reel" || type === "video" ? `/reels?start=${r.data.id}` : `/p/${r.data.id}`);
      router.refresh();
    } catch (e) {
      const code = (e as { code?: string }).code;
      setError(code ? errorText(lang, code) : (e as Error).message || t("error.generic"));
      setStatus(null);
      setBusy(false);
    }
  };

  const ready =
    kind === "text" ? caption.trim().length > 0 : kind === "photo" ? photos.length > 0 : kind === "meme" ? !!memeImage : !!video;

  const tabs: { key: Kind; label: string; icon: string }[] = [
    { key: "text", label: t("create.text"), icon: "✍️" },
    { key: "photo", label: t("create.photo"), icon: "📷" },
    { key: "meme", label: t("create.meme"), icon: "😂" },
    { key: "video", label: t("create.video"), icon: "🎬" },
  ];
  const input = "tap w-full rounded-xl border border-tent-200 bg-white px-3";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">{t("create.title")}</h1>
      {restored && (
        <p className="flex items-center justify-between rounded-xl bg-tent-100 px-3 py-2 text-sm">
          {t("create.draftRestored")}
          <button type="button" onClick={discard} className="min-h-8 font-semibold text-tent-700">
            {t("create.discardDraft")}
          </button>
        </p>
      )}
      <div className="grid grid-cols-4 gap-2" role="tablist">
        {tabs.map((x) => (
          <button
            key={x.key}
            type="button"
            role="tab"
            aria-selected={kind === x.key}
            onClick={() => setKind(x.key)}
            className={`tap rounded-2xl text-sm font-bold ring-1 ${kind === x.key ? "bg-tent-600 text-white ring-tent-600" : "bg-white ring-tent-200"}`}
          >
            <span className="block text-lg">{x.icon}</span>
            {x.label}
          </button>
        ))}
      </div>

      {kind === "photo" && (
        <div className="space-y-2">
          <label className="tap grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-tent-200 bg-white p-4 text-center font-semibold text-tent-700">
            📷 {t("create.addPhotos")}
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => setPhotos((prev) => [...prev, ...Array.from(e.target.files ?? [])].slice(0, MAX_PHOTOS))}
            />
          </label>
          {photos.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {photos.map((f, i) => (
                <div key={`${f.name}-${i}`} className="relative aspect-square overflow-hidden rounded-xl bg-tent-100">
                  <img src={previews[i]} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    aria-label={t("create.remove")}
                    onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                    className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {kind === "meme" && (
        <div className="space-y-2">
          <label className="tap grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-tent-200 bg-white p-4 font-semibold text-tent-700">
            🖼 {t("create.pickImage")}
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => setMemeImage(e.target.files?.[0] ?? null)} />
          </label>
          <input value={top} onChange={(e) => setTop(e.target.value)} placeholder={t("create.topText")} aria-label={t("create.topText")} maxLength={60} className={input} />
          <input value={bottom} onChange={(e) => setBottom(e.target.value)} placeholder={t("create.bottomText")} aria-label={t("create.bottomText")} maxLength={60} className={input} />
          {memeImage && <canvas ref={memeCanvas} className="w-full rounded-2xl" data-testid="meme-preview" />}
        </div>
      )}

      {kind === "video" && (
        <div className="space-y-2">
          <label className="tap grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-tent-200 bg-white p-4 font-semibold text-tent-700">
            🎬 {t("create.addVideo")}
            <input type="file" accept="video/*" className="sr-only" onChange={(e) => setVideo(e.target.files?.[0] ?? null)} />
          </label>
          {videoUrl && <video src={videoUrl} controls playsInline className="max-h-96 w-full rounded-2xl bg-black" />}
        </div>
      )}

      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        maxLength={2000}
        rows={kind === "text" ? 6 : 3}
        placeholder={kind === "text" ? t("create.whatsHappening") : t("create.caption")}
        aria-label={t("create.caption")}
        className="w-full rounded-2xl border border-tent-200 bg-white p-3 text-lg outline-none focus:border-tent-500"
      />
      {caption && <p className="-mt-3 text-right text-xs text-stone-400">{t("create.draftSaved")} · {caption.length}/2000</p>}

      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-xs font-semibold text-stone-600">
          {t("create.audience")}
          <select value={audience} onChange={(e) => setAudience(e.target.value as "public" | "followers")} className={input}>
            <option value="public">{t("create.public")}</option>
            <option value="followers">{t("create.followers")}</option>
          </select>
        </label>
        <label className="space-y-1 text-xs font-semibold text-stone-600">
          {t("create.tagEvent")}
          <select value={eventId} onChange={(e) => setEventId(e.target.value)} className={input}>
            <option value="">{t("create.noEvent")}</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      <button
        type="button"
        disabled={!ready || busy}
        onClick={() => void submit()}
        className="tap w-full rounded-2xl bg-tent-600 py-3 text-lg font-bold text-white disabled:opacity-50"
      >
        {busy ? (status ?? t("create.posting")) : t("create.post")}
      </button>
    </div>
  );
}
