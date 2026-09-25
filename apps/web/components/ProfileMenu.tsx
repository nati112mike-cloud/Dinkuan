"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { translator, type Lang } from "@dinkuan/i18n";
import { api } from "@/lib/client";
import { ReportSheet } from "./ReportSheet";
import { Sheet, SheetButton } from "./Sheet";

/** F14-AC5 block/mute, F22-AC3 report, F14-AC7 share link and F17-AC6 profile QR code. */
export function ProfileMenu({
  lang,
  userId,
  username,
  isSelf,
  muted,
  loggedIn,
}: {
  lang: Lang;
  userId: string;
  username: string;
  isSelf: boolean;
  muted: boolean;
  loggedIn: boolean;
}) {
  const t = translator(lang);
  const router = useRouter();
  const [open, setOpen] = useState<null | "menu" | "report" | "qr">(null);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const url = () => `${window.location.origin}/u/${username}`;

  useEffect(() => {
    if (open !== "qr") return;
    void QRCode.toString(url(), { type: "svg", margin: 1 }).then(setQr);
  }, [open]);

  return (
    <>
      <button type="button" aria-label={t("post.moreActions")} className="tap rounded-full bg-white px-3 text-xl ring-1 ring-tent-200" onClick={() => setOpen("menu")}>
        ⋯
      </button>
      <Sheet open={open === "menu"} onClose={() => setOpen(null)}>
        <SheetButton
          onClick={async () => {
            if (navigator.share) await navigator.share({ url: url() }).catch(() => undefined);
            else {
              await navigator.clipboard?.writeText(url()).catch(() => undefined);
              setCopied(true);
            }
          }}
        >
          ↗ {copied ? t("post.linkCopied") : t("profile.shareProfile")}
        </SheetButton>
        <SheetButton onClick={() => setOpen("qr")}>▦ {t("profile.qr")}</SheetButton>
        {!isSelf && loggedIn && (
          <>
            <SheetButton
              onClick={async () => {
                await api(`/api/users/${userId}/mute`, muted ? { method: "DELETE" } : { body: {} });
                setOpen(null);
                router.refresh();
              }}
            >
              🔕 {muted ? t("profile.unmute") : t("profile.mute")}
            </SheetButton>
            <SheetButton onClick={() => setOpen("report")}>🚩 {t("post.report")}</SheetButton>
            <SheetButton
              danger
              onClick={async () => {
                if (!window.confirm(t("profile.blockConfirm", { name: username }))) return;
                await api(`/api/users/${userId}/block`, { body: {} });
                router.push("/");
              }}
            >
              ⛔ {t("profile.block")}
            </SheetButton>
          </>
        )}
      </Sheet>
      <Sheet open={open === "qr"} onClose={() => setOpen(null)} title={t("profile.qr")}>
        <div className="mx-auto w-64 space-y-3 text-center">
          {qr ? <div className="rounded-2xl bg-white p-3 ring-1 ring-tent-100" dangerouslySetInnerHTML={{ __html: qr }} /> : <p>…</p>}
          <p className="font-bold">@{username}</p>
          <p className="text-sm text-stone-500">{t("profile.qrHint")}</p>
        </div>
      </Sheet>
      <ReportSheet lang={lang} open={open === "report"} onClose={() => setOpen(null)} targetType="profile" targetId={userId} />
    </>
  );
}
