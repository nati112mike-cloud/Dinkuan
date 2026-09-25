"use client";

import { useState } from "react";
import { translator, type Lang } from "@dinkuan/i18n";
import { api } from "@/lib/client";
import { Sheet, SheetButton } from "./Sheet";

/** F16-AC4: copy link, Telegram, WhatsApp, or repost to my profile with a comment. */
export function ShareSheet({
  lang,
  open,
  onClose,
  postId,
  text,
  loggedIn,
  onShared,
}: {
  lang: Lang;
  open: boolean;
  onClose: () => void;
  postId: string;
  text: string;
  loggedIn: boolean;
  onShared: () => void;
}) {
  const t = translator(lang);
  const [copied, setCopied] = useState(false);
  const [reposting, setReposting] = useState(false);
  const [comment, setComment] = useState("");
  const [reposted, setReposted] = useState(false);
  const url = () => `${window.location.origin}/p/${postId}`;
  const record = async (type: "external" | "repost", c?: string) => {
    if (!loggedIn) return;
    const r = await api(`/api/posts/${postId}/share`, { body: { type, comment: c } });
    if (r.ok) onShared();
  };
  return (
    <Sheet open={open} onClose={onClose} title={t("post.share")}>
      {reposting ? (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            await record("repost", comment);
            setReposted(true);
            setReposting(false);
          }}
        >
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder={t("post.repostComment")}
            className="w-full rounded-xl border border-tent-200 p-3"
          />
          <button className="tap w-full rounded-2xl bg-tent-600 font-bold text-white">{t("post.repost")}</button>
        </form>
      ) : (
        <div className="space-y-1">
          <SheetButton
            onClick={async () => {
              await navigator.clipboard?.writeText(url()).catch(() => undefined);
              setCopied(true);
              void record("external");
            }}
          >
            🔗 {copied ? t("post.linkCopied") : t("post.copyLink")}
          </SheetButton>
          <SheetButton
            onClick={() => {
              window.open(`https://t.me/share/url?url=${encodeURIComponent(url())}&text=${encodeURIComponent(text)}`, "_blank");
              void record("external");
            }}
          >
            ✈️ {t("post.shareTelegram")}
          </SheetButton>
          <SheetButton
            onClick={() => {
              window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url()}`)}`, "_blank");
              void record("external");
            }}
          >
            💬 {t("post.shareWhatsApp")}
          </SheetButton>
          {loggedIn && (
            <SheetButton onClick={() => setReposting(true)}>🔁 {reposted ? t("post.reposted") : t("post.repost")}</SheetButton>
          )}
        </div>
      )}
    </Sheet>
  );
}
