"use client";

import { useEffect, useRef } from "react";
import { adClickHref, SPONSORED_LABEL } from "@dinkuan/ads/text";

export { adClickHref };

/** F21-AC6: every promoted item carries this label, in both languages. */
export function SponsoredLabel({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-900 ${className}`} data-testid="sponsored">
      {SPONSORED_LABEL}
    </span>
  );
}

/**
 * Counts an impression once the promoted item has been at least half on screen for a second
 * (the server applies the daily frequency cap).
 */
export function AdView({ campaignId, placement, children, className }: { campaignId: string; placement: string; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const sent = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !sent.current) {
          timer = setTimeout(() => {
            sent.current = true;
            void fetch("/api/ads/impression", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ campaignId, placement }),
            });
          }, 1000);
        } else if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [campaignId, placement]);
  return (
    <div ref={ref} className={className} data-campaign={campaignId}>
      {children}
    </div>
  );
}
