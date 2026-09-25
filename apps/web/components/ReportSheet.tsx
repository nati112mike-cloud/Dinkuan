"use client";

import { useState } from "react";
import { translator, type Lang, type MessageKey } from "@dinkuan/i18n";
import { api, errorText } from "@/lib/client";
import { Sheet } from "./Sheet";

const REASONS = ["spam", "nudity", "violence", "hate", "harassment", "scam", "copyright", "other"] as const;

/** F22-AC3: report a post, comment or profile. */
export function ReportSheet({
  lang,
  open,
  onClose,
  targetType,
  targetId,
}: {
  lang: Lang;
  open: boolean;
  onClose: () => void;
  targetType: "post" | "comment" | "profile";
  targetId: string;
}) {
  const t = translator(lang);
  const [reason, setReason] = useState<(typeof REASONS)[number] | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "done" | string>("idle");
  return (
    <Sheet open={open} onClose={onClose} title={t("report.title")}>
      {state === "done" ? (
        <p className="py-4 font-semibold text-emerald-700">{t("report.thanks")}</p>
      ) : (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!reason) return;
            setState("sending");
            const r = await api("/api/reports", { body: { targetType, targetId, reason } });
            setState(r.ok ? "done" : errorText(lang, r.code));
          }}
        >
          {REASONS.map((r) => (
            <label key={r} className="tap flex items-center gap-3 rounded-xl px-3 hover:bg-tent-50">
              <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} className="h-5 w-5 accent-tent-600" />
              {t(`report.${r}` as MessageKey)}
            </label>
          ))}
          {state !== "idle" && state !== "sending" && <p className="text-sm text-red-600">{state}</p>}
          <button
            disabled={!reason || state === "sending"}
            className="tap mt-2 w-full rounded-2xl bg-tent-600 font-bold text-white disabled:opacity-50"
          >
            {t("report.send")}
          </button>
        </form>
      )}
    </Sheet>
  );
}
