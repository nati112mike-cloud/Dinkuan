import "server-only";
import type { VendorCardRow } from "@dinkuan/marketplace";
import type { VendorCardDTO } from "./market-types";

export function toVendorCard(v: VendorCardRow, extra: { saved?: boolean; campaignId?: string } = {}): VendorCardDTO {
  const p = v.user.profile;
  return {
    userId: v.userId,
    username: p?.username ?? "",
    displayName: p?.displayName || p?.username || "",
    avatarUrl: p?.avatarUrl ?? null,
    isVerified: p?.isVerified ?? false,
    headline: v.headline,
    types: v.types,
    level: v.level,
    ratingAvg: v.ratingAvg,
    ratingCount: v.ratingCount,
    startingPriceSantim: v.startingPriceSantim,
    genres: v.genres.slice(0, 3),
    coverUrl: v.coverUrl ?? v.albums[0]?.coverUrl ?? null,
    saved: extra.saved ?? false,
    campaignId: extra.campaignId ?? null,
  };
}
