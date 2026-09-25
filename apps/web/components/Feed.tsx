"use client";

import { useEffect, useRef, useState } from "react";
import { translator, type Lang } from "@dinkuan/i18n";
import { api } from "@/lib/client";
import type { FeedPageDTO, PostDTO } from "@/lib/social-types";
import { PostCard } from "./PostCard";

/** A list of posts that loads the next cursor page as you scroll (CLAUDE.md rule 19). */
export function Feed({
  initial,
  endpoint,
  lang,
  loggedIn,
  empty,
}: {
  initial: FeedPageDTO;
  endpoint: string;
  lang: Lang;
  loggedIn: boolean;
  empty?: React.ReactNode;
}) {
  const t = translator(lang);
  const [items, setItems] = useState<PostDTO[]>(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = async () => {
    if (!cursor || loading) return;
    setLoading(true);
    const sep = endpoint.includes("?") ? "&" : "?";
    const r = await api<FeedPageDTO>(`${endpoint}${sep}cursor=${encodeURIComponent(cursor)}`);
    if (r.ok) {
      setItems((prev) => [...prev, ...r.data.items.filter((p) => !prev.some((x) => x.id === p.id))]);
      setCursor(r.data.nextCursor);
    }
    setLoading(false);
  };

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && void loadMore(), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  });

  if (items.length === 0) return <>{empty ?? <p className="py-8 text-center text-stone-500">{t("feed.empty")}</p>}</>;
  return (
    <div className="space-y-4">
      {items.map((p) => (
        <PostCard key={p.id} post={p} lang={lang} loggedIn={loggedIn} />
      ))}
      <div ref={sentinel} />
      {cursor ? (
        <button type="button" onClick={() => void loadMore()} disabled={loading} className="tap w-full rounded-2xl bg-white font-semibold ring-1 ring-tent-200">
          {loading ? "…" : t("feed.loadMore")}
        </button>
      ) : (
        <p className="py-4 text-center text-sm text-stone-400">{t("feed.end")}</p>
      )}
    </div>
  );
}
