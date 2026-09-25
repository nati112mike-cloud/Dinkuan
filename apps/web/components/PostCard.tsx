"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { translator, type Lang } from "@dinkuan/i18n";
import { REACTION_EMOJI, REACTIONS, type ReactionKey } from "@dinkuan/social/text";
import { api, compactNumber, errorText, loginUrl, timeAgo } from "@/lib/client";
import type { MediaDTO, PostDTO } from "@/lib/social-types";
import { Avatar } from "./Avatar";
import { Caption } from "./Caption";
import { ReportSheet } from "./ReportSheet";
import { ShareSheet } from "./ShareSheet";
import { Sheet, SheetButton } from "./Sheet";

export function PostCard({ post, lang, loggedIn, detail = false }: { post: PostDTO; lang: Lang; loggedIn: boolean; detail?: boolean }) {
  const t = translator(lang);
  const router = useRouter();
  const [reaction, setReaction] = useState<string | null>(post.myReaction);
  const [reactionCount, setReactionCount] = useState(post.reactionCount);
  const [shareCount, setShareCount] = useState(post.shareCount);
  const [saved, setSaved] = useState(post.saved);
  const [caption, setCaption] = useState(post.caption);
  const [edited, setEdited] = useState(post.edited);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.caption);
  const [menu, setMenu] = useState<null | "actions" | "report" | "share" | "save" | "picker">(null);
  const [collection, setCollection] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [burst, setBurst] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  if (deleted) return null;

  const requireLogin = () => {
    if (loggedIn) return true;
    router.push(loginUrl());
    return false;
  };

  const setMyReaction = async (type: ReactionKey | null) => {
    if (!requireLogin()) return;
    const prev = reaction;
    setReaction(type);
    setReactionCount((c) => c + (type && !prev ? 1 : !type && prev ? -1 : 0));
    const r = await api<{ reactionCount: number }>(`/api/posts/${post.id}/react`, type ? { body: { type } } : { method: "DELETE" });
    if (r.ok) setReactionCount(r.data.reactionCount);
    else {
      setReaction(prev);
      setError(errorText(lang, r.code));
    }
  };

  const onDoubleTap = () => {
    setBurst(true);
    setTimeout(() => setBurst(false), 700);
    if (!reaction) void setMyReaction("like");
  };

  const toggleSave = async (name = "") => {
    if (!requireLogin()) return;
    const r = await api<{ saved: boolean }>(`/api/posts/${post.id}/save`, { body: { collection: name } });
    if (r.ok) setSaved(r.data.saved);
    setMenu(null);
  };

  const author = post.author;
  const statusNote = post.isMine && post.status !== "public";

  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-tent-100" data-testid="post">
      <header className="flex items-center gap-3 p-3">
        <Link href={`/u/${author.username}`} className="shrink-0">
          <Avatar profile={author} size={40} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/u/${author.username}`} className="block truncate font-bold leading-tight">
            {author.displayName}
            {author.isVerified && (
              <span className="ml-1 text-sky-600" title={t("badge.verified")}>
                ✓
              </span>
            )}
          </Link>
          <p className="truncate text-xs text-stone-500">
            @{author.username} · <time dateTime={post.createdAt}>{timeAgo(post.createdAt, lang)}</time>
            {edited && ` · ${t("post.edited")}`}
            {post.audience === "followers" && ` · 🔒 ${t("post.followersOnly")}`}
          </p>
        </div>
        <button type="button" aria-label={t("post.moreActions")} className="tap text-xl text-stone-500" onClick={() => setMenu("actions")}>
          ⋯
        </button>
      </header>

      {statusNote && <p className="mx-3 mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{t("post.underReview")}</p>}

      {post.type === "text" && !editing && (
        <div className="px-4 pb-3" onDoubleClick={onDoubleTap}>
          <Caption text={caption} className="text-lg leading-snug" />
        </div>
      )}

      {post.media.length > 0 && (
        <div className="relative" onDoubleClick={onDoubleTap}>
          <Media post={post} media={post.media} lang={lang} />
          {burst && (
            <span className="pointer-events-none absolute inset-0 grid place-items-center text-7xl drop-shadow-lg" aria-hidden>
              👍
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-1 px-2 pt-1">
        <button
          type="button"
          aria-pressed={!!reaction}
          aria-label={t("post.react")}
          className={`tap flex items-center gap-1 rounded-full px-3 text-lg ${reaction ? "text-tent-600" : ""}`}
          onPointerDown={() => {
            longPressed.current = false;
            pressTimer.current = setTimeout(() => {
              longPressed.current = true;
              setMenu("picker");
            }, 450);
          }}
          onPointerUp={() => pressTimer.current && clearTimeout(pressTimer.current)}
          onPointerLeave={() => pressTimer.current && clearTimeout(pressTimer.current)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu("picker");
          }}
          onClick={() => {
            if (longPressed.current) return;
            void setMyReaction(reaction ? null : "like");
          }}
        >
          <span>{reaction ? REACTION_EMOJI[reaction as ReactionKey] : "🤍"}</span>
          <span className="text-sm font-semibold">{compactNumber(reactionCount, lang)}</span>
        </button>
        <button type="button" aria-label={t("post.react")} className="tap rounded-full px-1 text-sm text-stone-500" onClick={() => setMenu("picker")}>
          ＋
        </button>
        <Link href={`/p/${post.id}#comments`} className="tap flex items-center gap-1 rounded-full px-3 text-lg" aria-label={t("post.comments")}>
          💬 <span className="text-sm font-semibold">{compactNumber(post.commentCount, lang)}</span>
        </Link>
        <button type="button" className="tap flex items-center gap-1 rounded-full px-3 text-lg" aria-label={t("post.share")} onClick={() => setMenu("share")}>
          ↗ <span className="text-sm font-semibold">{compactNumber(shareCount, lang)}</span>
        </button>
        <button
          type="button"
          aria-pressed={saved}
          aria-label={saved ? t("post.saved") : t("post.save")}
          className={`tap ml-auto rounded-full px-3 text-lg ${saved ? "text-tent-600" : ""}`}
          onClick={() => void toggleSave()}
        >
          {saved ? "🔖" : "📑"}
        </button>
      </div>

      <div className="space-y-2 px-4 pb-4 pt-1">
        {editing ? (
          <form
            className="space-y-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await api<{ caption: string }>(`/api/posts/${post.id}`, { method: "PATCH", body: { caption: draft } });
              if (r.ok) {
                setCaption(r.data.caption);
                setEdited(true);
                setEditing(false);
                setError(null);
              } else setError(errorText(lang, r.code));
            }}
          >
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} rows={3} className="w-full rounded-xl border border-tent-200 p-3" />
            <div className="flex gap-2">
              <button className="tap rounded-xl bg-tent-600 px-4 font-semibold text-white">{t("post.saveChanges")}</button>
              <button type="button" className="tap rounded-xl px-4 font-semibold ring-1 ring-tent-200" onClick={() => setEditing(false)}>
                {t("post.cancel")}
              </button>
            </div>
          </form>
        ) : (
          post.type !== "text" && caption && <Caption text={caption} className={detail ? "" : "line-clamp-4"} />
        )}
        {post.event && (
          <Link href={`/e/${post.event.slug}`} className="inline-flex items-center gap-1 rounded-full bg-tent-50 px-3 py-1 text-xs font-semibold text-tent-700 ring-1 ring-tent-200">
            🎟 {t("post.atEvent", { event: post.event.title })}
          </Link>
        )}
        {!detail && post.commentCount > 0 && (
          <Link href={`/p/${post.id}#comments`} className="block text-sm text-stone-500">
            {t("post.viewComments", { count: post.commentCount })}
          </Link>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <Sheet open={menu === "picker"} onClose={() => setMenu(null)} title={t("post.react")}>
        <div className="flex justify-between gap-1">
          {REACTIONS.map((r) => (
            <button
              key={r}
              type="button"
              aria-label={r}
              className={`tap grid flex-1 place-items-center rounded-2xl text-3xl ${reaction === r ? "bg-tent-100" : "hover:bg-tent-50"}`}
              onClick={() => {
                setMenu(null);
                void setMyReaction(reaction === r ? null : r);
              }}
            >
              {REACTION_EMOJI[r]}
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={menu === "actions"} onClose={() => setMenu(null)}>
        {post.isMine ? (
          <>
            <SheetButton
              onClick={() => {
                setDraft(caption);
                setEditing(true);
                setMenu(null);
              }}
            >
              ✏️ {t("post.edit")}
            </SheetButton>
            <SheetButton
              danger
              onClick={async () => {
                if (!window.confirm(t("post.deleteConfirm"))) return;
                const r = await api(`/api/posts/${post.id}`, { method: "DELETE" });
                if (r.ok) {
                  setDeleted(true);
                  if (detail) router.push(`/u/${author.username}`);
                }
                setMenu(null);
              }}
            >
              🗑 {t("post.delete")}
            </SheetButton>
          </>
        ) : (
          <SheetButton onClick={() => (requireLogin() ? setMenu("report") : undefined)}>🚩 {t("post.report")}</SheetButton>
        )}
        <SheetButton onClick={() => (requireLogin() ? setMenu("save") : undefined)}>📑 {t("post.saveTo")}</SheetButton>
      </Sheet>

      <Sheet open={menu === "save"} onClose={() => setMenu(null)} title={t("post.saveTo")}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void toggleSave(collection);
          }}
        >
          <input
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
            maxLength={40}
            placeholder={t("post.collectionName")}
            className="tap w-full rounded-xl border border-tent-200 px-3"
          />
          <button className="tap w-full rounded-2xl bg-tent-600 font-bold text-white">{t("post.save")}</button>
        </form>
      </Sheet>

      <ReportSheet lang={lang} open={menu === "report"} onClose={() => setMenu(null)} targetType="post" targetId={post.id} />
      <ShareSheet
        lang={lang}
        open={menu === "share"}
        onClose={() => setMenu(null)}
        postId={post.id}
        text={caption.slice(0, 120)}
        loggedIn={loggedIn}
        onShared={() => setShareCount((c) => c + 1)}
      />
    </article>
  );
}

function Media({ post, media, lang }: { post: PostDTO; media: MediaDTO[]; lang: Lang }) {
  const t = translator(lang);
  const [index, setIndex] = useState(0);
  const first = media[0]!;
  if (first.kind === "video") {
    const portrait = first.height > first.width;
    return (
      <Link href={`/reels?start=${post.id}`} className="relative block bg-black" aria-label={t("nav.reels")}>
        {first.thumbUrl ? (
          <img src={first.thumbUrl} alt="" loading="lazy" className={`w-full object-cover ${portrait ? "aspect-[4/5]" : "aspect-video"}`} />
        ) : (
          <video src={first.url} muted playsInline preload="metadata" className={`w-full object-cover ${portrait ? "aspect-[4/5]" : "aspect-video"}`} />
        )}
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-black/50 text-3xl text-white">▶</span>
        </span>
        <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
          {t("post.views", { count: compactNumber(post.viewCount, lang) })}
        </span>
      </Link>
    );
  }
  const ratio = Math.min(Math.max(first.height / first.width, 0.8), 1.25);
  return (
    <div className="relative">
      <div
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
      >
        {media.map((m, i) => (
          <img
            key={m.url}
            src={m.url}
            alt=""
            loading={i === 0 ? "eager" : "lazy"}
            style={{ aspectRatio: `1 / ${ratio}` }}
            className="w-full shrink-0 snap-center bg-tent-50 object-cover"
          />
        ))}
      </div>
      {media.length > 1 && (
        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5" aria-hidden>
          {media.map((m, i) => (
            <span key={m.url} className={`h-1.5 w-1.5 rounded-full ${i === index ? "bg-white" : "bg-white/50"}`} />
          ))}
        </div>
      )}
    </div>
  );
}
