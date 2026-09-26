/**
 * Pure promotion helpers, safe to import in the browser.
 */

/** F21-AC9: the same promotion is shown to the same person at most 3 times a day. */
export const FREQUENCY_CAP_PER_DAY = 3;

/** F21-AC6: shown on every promoted item, in both languages whatever the UI language is. */
export const SPONSORED_LABEL = "Sponsored · ማስታወቂያ";

/** Where in the feed a sponsored post goes: after the 3rd post, then every 8th. */
export const FEED_AD_SLOTS = { first: 3, every: 8 } as const;

export const PROMO_TARGETS = ["event", "post", "profile", "package"] as const;
export type PromoTargetKey = (typeof PROMO_TARGETS)[number];

/** Today's date in Addis Ababa (UTC+3), which is the "day" for caps and pacing. */
export function addisDay(now = new Date()): string {
  return new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}

/**
 * F21-AC2: an honest range for how many people a package reaches. Impression packages reach
 * roughly impressions ÷ frequency (people see an ad 1.3–3 times); slot packages use the daily
 * audience of the slot.
 */
export function estimatedReach(p: { impressions: number | null; days: number; placements: string[] }, dailyActive = 4000) {
  if (p.impressions) {
    return { low: Math.round(p.impressions / FREQUENCY_CAP_PER_DAY / 100) * 100, high: Math.round(p.impressions / 1.3 / 100) * 100 };
  }
  const share = p.placements.includes("home_weekend") ? 0.6 : p.placements.includes("events_featured") ? 0.35 : 0.2;
  const perDay = dailyActive * share;
  const low = Math.round((perDay * p.days * 0.5) / 100) * 100;
  const high = Math.round((perDay * p.days * 0.8) / 100) * 100;
  return { low, high: Math.max(high, low) };
}

/** Sponsored items link through the click counter, which then redirects to the promoted thing. */
export function adClickHref(campaignId: string, placement: string) {
  return `/api/ads/click?c=${encodeURIComponent(campaignId)}&p=${encodeURIComponent(placement)}`;
}
