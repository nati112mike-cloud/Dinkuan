"use client";

import { useState } from "react";
import { translator, type Lang, type MessageKey } from "@dinkuan/i18n";
import { ReportSheet } from "./ReportSheet";

/** F22-AC3: a small "report" link for chat messages and reviews. */
export function ReportButton({
  lang,
  targetType,
  targetId,
  label,
  className = "",
}: {
  lang: Lang;
  targetType: "message" | "review";
  targetId: string;
  label: MessageKey;
  className?: string;
}) {
  const t = translator(lang);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`text-[11px] font-semibold underline-offset-2 hover:underline ${className}`}>
        ⚑ {t(label)}
      </button>
      {open && <ReportSheet lang={lang} open onClose={() => setOpen(false)} targetType={targetType} targetId={targetId} />}
    </>
  );
}
