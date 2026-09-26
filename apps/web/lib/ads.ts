import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { FEED_AD_SLOTS, sponsoredPosts } from "@dinkuan/ads";
import type { Lang } from "@dinkuan/i18n";
import type { PostDTO } from "./social-types";
import { toPostDTO } from "./social";

/** Anonymous visitor id, so frequency caps (F21-AC9) also work before login. */
export const VISITOR_COOKIE = "dk_vid";
/** The promotion a visitor last clicked, for attributing ticket sales and requests (F21-AC7). */
export const AD_COOKIE = "dk_ad";
export const AD_COOKIE_DAYS = 7;

export async function viewerKey(userId: string | null): Promise<string | null> {
  if (userId) return userId;
  return (await cookies()).get(VISITOR_COOKIE)?.value ?? null;
}

export function newVisitorId() {
  return `v_${randomUUID()}`;
}

export async function clickedCampaign(): Promise<string | null> {
  return (await cookies()).get(AD_COOKIE)?.value ?? null;
}

/**
 * Puts sponsored posts into a page of the feed or reels: after the 3rd item on the first page,
 * then one per later page. A sponsored post replaces its own organic copy on that page.
 */
export async function withSponsoredPosts(
  items: PostDTO[],
  placement: "feed" | "reels",
  opts: { viewerId: string | null; lang: Lang; firstPage: boolean },
): Promise<PostDTO[]> {
  if (items.length < FEED_AD_SLOTS.first) return items;
  const key = await viewerKey(opts.viewerId);
  const [ad] = await sponsoredPosts(placement, key, opts.viewerId, 1);
  if (!ad) return items;
  const dto: PostDTO = { ...toPostDTO(ad.post, opts.viewerId, opts.lang), sponsored: { campaignId: ad.campaignId, placement } };
  const rest = items.filter((p) => p.id !== dto.id);
  const at = Math.min(opts.firstPage ? FEED_AD_SLOTS.first : Math.floor(rest.length / 2), rest.length);
  return [...rest.slice(0, at), dto, ...rest.slice(at)];
}

