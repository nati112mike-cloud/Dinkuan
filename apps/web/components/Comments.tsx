"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { translator, type Lang } from "@dinkuan/i18n";
import { api, errorText, loginUrl, timeAgo } from "@/lib/client";
import type { ProfileDTO } from "@/lib/social-types";
import { Avatar } from "./Avatar";
import { Caption } from "./Caption";
import { ReportSheet } from "./ReportSheet";

type CommentRow = {
  id: string;
  body: string;
  authorId: string;
  parentId: string | null;
  likeCount: number;
  pinned: boolean;
  status: string;
  createdAt: string;
  likedByMe: boolean;
  author: { id: string; profile: (ProfileDTO & { displayName: string }) | null };
  replies?: CommentRow[];
};

/** F16-AC3: comments with one level of replies, likes, pin, hide and delete. */
export function Comments({ postId, postAuthorId, lang, viewerId }: { postId: string; postAuthorId: string; lang: Lang; viewerId: string | null }) {
  const t = translator(lang);
  const router = useRouter();
  const [rows, setRows] = useState<CommentRow[] | null>(null);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<CommentRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await api<CommentRow[]>(`/api/posts/${postId}/comments`);
    if (r.ok) setRows(r.data);
  };
  useEffect(() => {
    void load();
  }, [postId]);

  const isOwner = viewerId === postAuthorId;

  const Row = ({ c, reply = false }: { c: CommentRow; reply?: boolean }) => {
    const p = c.author.profile;
    const name = p?.username ?? "member";
    return (
      <li className={`flex gap-3 ${reply ? "ml-11" : ""}`} data-testid="comment">
        <Link href={`/u/${name}`} className="shrink-0">
          <Avatar profile={{ username: name, displayName: p?.displayName ?? name, avatarUrl: p?.avatarUrl ?? null }} size={reply ? 28 : 34} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <Link href={`/u/${name}`} className="font-bold">
              {name}
            </Link>{" "}
            <span className="text-xs text-stone-500">{timeAgo(c.createdAt, lang)}</span>
            {c.pinned && <span className="ml-2 text-xs font-semibold text-tent-600">📌 {t("post.pinned")}</span>}
          </p>
          <Caption text={c.body} className="text-[15px]" />
          {c.status === "hidden" && <p className="text-xs text-amber-700">{t("post.hiddenNote")}</p>}
          <div className="flex flex-wrap gap-3 text-xs font-semibold text-stone-500">
            <button
              type="button"
              className={`min-h-8 ${c.likedByMe ? "text-tent-600" : ""}`}
              onClick={async () => {
                if (!viewerId) return router.push(loginUrl());
                const r = await api(`/api/comments/${c.id}/like`, { body: {} });
                if (r.ok) void load();
              }}
            >
              {c.likedByMe ? "♥" : "♡"} {c.likeCount || ""}
            </button>
            <button type="button" className="min-h-8" onClick={() => (viewerId ? setReplyTo(c) : router.push(loginUrl()))}>
              {t("post.reply")}
            </button>
            {isOwner && !reply && (
              <button type="button" className="min-h-8" onClick={async () => (await api(`/api/comments/${c.id}/pin`, { body: {} })).ok && load()}>
                {c.pinned ? t("post.unpin") : t("post.pin")}
              </button>
            )}
            {isOwner && c.authorId !== viewerId && c.status === "visible" && (
              <button type="button" className="min-h-8" onClick={async () => (await api(`/api/comments/${c.id}/hide`, { body: {} })).ok && load()}>
                {t("post.hide")}
              </button>
            )}
            {(isOwner || c.authorId === viewerId) && (
              <button
                type="button"
                className="min-h-8 text-red-600"
                onClick={async () => (await api(`/api/comments/${c.id}`, { method: "DELETE" })).ok && load()}
              >
                {t("post.delete").split(" ")[0]}
              </button>
            )}
            {viewerId && c.authorId !== viewerId && (
              <button type="button" className="min-h-8" onClick={() => setReporting(c.id)}>
                {t("post.report")}
              </button>
            )}
          </div>
        </div>
      </li>
    );
  };

  return (
    <section id="comments" className="space-y-4">
      <h2 className="text-lg font-bold">{t("post.comments")}</h2>
      {rows === null ? (
        <p className="text-stone-400">…</p>
      ) : rows.length === 0 ? (
        <p className="text-stone-500">{t("post.noComments")}</p>
      ) : (
        <ul className="space-y-4">
          {rows.map((c) => (
            <div key={c.id} className="space-y-3">
              <Row c={c} />
              {c.replies?.map((r) => <Row key={r.id} c={r} reply />)}
            </div>
          ))}
        </ul>
      )}
      <form
        className="sticky bottom-20 space-y-1 rounded-2xl bg-white p-2 shadow-lg ring-1 ring-tent-100"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!viewerId) return router.push(loginUrl());
          if (!body.trim()) return;
          setBusy(true);
          const r = await api(`/api/posts/${postId}/comments`, { body: { body, parentId: replyTo?.id ?? null } });
          setBusy(false);
          if (r.ok) {
            setBody("");
            setReplyTo(null);
            setError(null);
            void load();
          } else setError(errorText(lang, r.code));
        }}
      >
        {replyTo && (
          <p className="flex items-center justify-between px-2 text-xs text-stone-500">
            {t("post.replyingTo", { name: replyTo.author.profile?.username ?? "" })}
            <button type="button" onClick={() => setReplyTo(null)} className="min-h-8 px-2">
              ✕
            </button>
          </p>
        )}
        <div className="flex gap-2">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={500}
            placeholder={t("post.addComment")}
            aria-label={t("post.addComment")}
            className="tap min-w-0 flex-1 rounded-xl px-3 outline-none"
          />
          <button disabled={busy || !body.trim()} className="tap rounded-xl bg-tent-600 px-4 font-semibold text-white disabled:opacity-50">
            {t("post.send")}
          </button>
        </div>
        {error && <p className="px-2 text-sm text-red-600">{error}</p>}
      </form>
      {reporting && <ReportSheet lang={lang} open onClose={() => setReporting(null)} targetType="comment" targetId={reporting} />}
    </section>
  );
}
