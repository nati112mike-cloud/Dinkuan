"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { translator, type Lang } from "@dinkuan/i18n";
import { REACTION_EMOJI, type ReactionKey } from "@dinkuan/social/text";
import { api, compactNumber, loginUrl } from "@/lib/client";
import type { FeedPageDTO, PostDTO } from "@/lib/social-types";
import { Avatar } from "./Avatar";
import { Caption } from "./Caption";
import { ShareSheet } from "./ShareSheet";

/**
 * F16-AC7/AC8: full-screen vertical reels. Autoplays muted with a tap to unmute, loops, shows
 * progress and views, and preloads the next two. Low-data mode: small renditions, no autoplay,
 * no preloading. F16-AC9: reports watch time and completions.
 */
export function ReelsPlayer({ initial, lang, loggedIn, lowData }: { initial: FeedPageDTO; lang: Lang; loggedIn: boolean; lowData: boolean }) {
  const t = translator(lang);
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const loading = useRef(false);

  const loadMore = useCallback(async () => {
    if (!cursor || loading.current) return;
    loading.current = true;
    const r = await api<FeedPageDTO>(`/api/reels?cursor=${encodeURIComponent(cursor)}`);
    if (r.ok) {
      setItems((prev) => [...prev, ...r.data.items.filter((p) => !prev.some((x) => x.id === p.id))]);
      setCursor(r.data.nextCursor);
    }
    loading.current = false;
  }, [cursor]);

  useEffect(() => {
    if (active >= items.length - 3) void loadMore();
  }, [active, items.length, loadMore]);

  return (
    <div className="fixed inset-0 z-40 bg-black text-white">
      <Link href="/" className="tap absolute left-3 top-3 z-10 grid place-items-center rounded-full bg-black/40 text-2xl" aria-label={t("nav.home")}>
        ✕
      </Link>
      {items.length === 0 ? (
        <p className="grid h-full place-items-center text-stone-300">{t("reels.empty")}</p>
      ) : (
        <div className="no-scrollbar h-full snap-y snap-mandatory overflow-y-scroll" data-testid="reels">
          {items.map((p, i) => (
            <Reel
              key={p.id}
              post={p}
              lang={lang}
              loggedIn={loggedIn}
              lowData={lowData}
              isActive={i === active}
              preload={!lowData && i > active && i <= active + 2}
              muted={muted}
              onMutedChange={setMuted}
              onVisible={() => setActive(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Reel({
  post,
  lang,
  loggedIn,
  lowData,
  isActive,
  preload,
  muted,
  onMutedChange,
  onVisible,
}: {
  post: PostDTO;
  lang: Lang;
  loggedIn: boolean;
  lowData: boolean;
  isActive: boolean;
  preload: boolean;
  muted: boolean;
  onMutedChange: (m: boolean) => void;
  onVisible: () => void;
}) {
  const t = translator(lang);
  const router = useRouter();
  const box = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(lowData);
  const [reaction, setReaction] = useState(post.myReaction);
  const [reactionCount, setReactionCount] = useState(post.reactionCount);
  const [saved, setSaved] = useState(post.saved);
  const [share, setShare] = useState(false);
  const [burst, setBurst] = useState(false);
  const watched = useRef({ ms: 0, last: 0, completed: false, sent: false });
  const lastTap = useRef(0);
  const media = post.media[0];
  const src = media ? (lowData && media.lowUrl ? media.lowUrl : media.url) : "";

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && onVisible(), { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, [onVisible]);

  const sendView = useCallback(() => {
    const w = watched.current;
    if (w.sent || (w.ms < 1000 && !w.completed)) return;
    w.sent = true;
    void api(`/api/posts/${post.id}/view`, { body: { watchedMs: w.ms, completed: w.completed } });
  }, [post.id]);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (isActive && !lowData) {
      v.play().then(() => setPaused(false), () => setPaused(true));
    } else if (!isActive) {
      v.pause();
      sendView();
    }
  }, [isActive, lowData, sendView]);

  useEffect(() => () => sendView(), [sendView]);

  const like = async () => {
    if (!loggedIn) return router.push(loginUrl());
    if (reaction) return;
    setReaction("like");
    setReactionCount((c) => c + 1);
    const r = await api<{ reactionCount: number }>(`/api/posts/${post.id}/react`, { body: { type: "like" } });
    if (r.ok) setReactionCount(r.data.reactionCount);
  };

  const toggleReaction = async () => {
    if (!loggedIn) return router.push(loginUrl());
    if (!reaction) return like();
    setReaction(null);
    setReactionCount((c) => c - 1);
    const r = await api<{ reactionCount: number }>(`/api/posts/${post.id}/react`, { method: "DELETE" });
    if (r.ok) setReactionCount(r.data.reactionCount);
  };

  const onTap = () => {
    const v = video.current;
    if (!v) return;
    const now = Date.now();
    if (now - lastTap.current < 300) {
      setBurst(true);
      setTimeout(() => setBurst(false), 700);
      void like();
      lastTap.current = 0;
      return;
    }
    lastTap.current = now;
    setTimeout(() => {
      if (lastTap.current !== now) return;
      if (muted && !v.paused) {
        onMutedChange(false);
      } else if (v.paused) {
        void v.play().then(() => setPaused(false));
      } else {
        v.pause();
        setPaused(true);
      }
    }, 300);
  };

  return (
    <section ref={box} className="relative h-[100dvh] w-full snap-start snap-always" data-testid="reel">
      {media && (
        <video
          ref={video}
          src={src}
          poster={media.thumbUrl ?? undefined}
          className="h-full w-full object-contain"
          muted={muted}
          loop
          playsInline
          preload={isActive || preload ? "auto" : "none"}
          onClick={onTap}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            const w = watched.current;
            if (v.currentTime > w.last) w.ms += (v.currentTime - w.last) * 1000;
            else if (w.last - v.currentTime > 1 && w.ms > 0) w.completed = true; // looped
            w.last = v.currentTime;
            setProgress(v.duration ? v.currentTime / v.duration : 0);
          }}
        />
      )}
      {burst && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center text-8xl" aria-hidden>
          👍
        </span>
      )}
      {isActive && muted && !paused && (
        <button type="button" onClick={() => onMutedChange(false)} className="absolute left-1/2 top-16 -translate-x-1/2 rounded-full bg-black/60 px-4 py-2 text-sm">
          🔇 {t("reels.tapToUnmute")}
        </button>
      )}
      {paused && (
        <button
          type="button"
          aria-label="Play"
          onClick={() => void video.current?.play().then(() => setPaused(false))}
          className="absolute inset-0 grid place-items-center"
        >
          <span className="grid h-20 w-20 place-items-center rounded-full bg-black/50 text-4xl">▶</span>
          {lowData && <span className="absolute bottom-40 rounded-full bg-black/60 px-3 py-1 text-xs">{t("reels.lowData")}</span>}
        </button>
      )}

      <div className="absolute bottom-24 right-2 flex flex-col items-center gap-4 text-center text-xs font-semibold">
        <Link href={`/u/${post.author.username}`} aria-label={post.author.displayName}>
          <Avatar profile={post.author} size={44} />
        </Link>
        <button type="button" onClick={() => void toggleReaction()} className="tap flex flex-col items-center" aria-pressed={!!reaction} aria-label={t("post.react")}>
          <span className="text-3xl">{reaction ? REACTION_EMOJI[reaction as ReactionKey] : "🤍"}</span>
          {compactNumber(reactionCount, lang)}
        </button>
        <Link href={`/p/${post.id}#comments`} className="tap flex flex-col items-center" aria-label={t("post.comments")}>
          <span className="text-3xl">💬</span>
          {compactNumber(post.commentCount, lang)}
        </Link>
        <button type="button" onClick={() => setShare(true)} className="tap flex flex-col items-center" aria-label={t("post.share")}>
          <span className="text-3xl">↗</span>
          {compactNumber(post.shareCount, lang)}
        </button>
        <button
          type="button"
          aria-pressed={saved}
          aria-label={t("post.save")}
          className="tap text-3xl"
          onClick={async () => {
            if (!loggedIn) return router.push(loginUrl());
            const r = await api<{ saved: boolean }>(`/api/posts/${post.id}/save`, { body: { collection: "" } });
            if (r.ok) setSaved(r.data.saved);
          }}
        >
          {saved ? "🔖" : "📑"}
        </button>
      </div>

      <div className="absolute bottom-6 left-0 right-16 space-y-1 bg-gradient-to-t from-black/70 to-transparent px-4 pb-2 pt-10">
        <Link href={`/u/${post.author.username}`} className="font-bold">
          @{post.author.username}
          {post.author.isVerified && <span className="ml-1 text-sky-400">✓</span>}
        </Link>
        {post.caption && <Caption text={post.caption} className="line-clamp-2 text-sm [&_a]:text-tent-200" />}
        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-200">
          <span>▶ {t("post.views", { count: compactNumber(post.viewCount, lang) })}</span>
          {post.event && (
            <Link href={`/e/${post.event.slug}`} className="rounded-full bg-white/20 px-2 py-0.5 font-semibold">
              🎟 {post.event.title}
            </Link>
          )}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20" aria-hidden>
        <div className="h-full bg-white" style={{ width: `${progress * 100}%` }} />
      </div>
      <ShareSheet
        lang={lang}
        open={share}
        onClose={() => setShare(false)}
        postId={post.id}
        text={post.caption.slice(0, 120)}
        loggedIn={loggedIn}
        onShared={() => undefined}
      />
    </section>
  );
}
