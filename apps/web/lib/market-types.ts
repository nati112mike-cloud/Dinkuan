/** JSON-safe shapes for marketplace client components. */
export type VendorCardDTO = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  headline: string;
  types: string[];
  level: "new" | "rising" | "top_rated" | "pro";
  ratingAvg: number;
  ratingCount: number;
  startingPriceSantim: number | null;
  genres: string[];
  coverUrl: string | null;
  saved: boolean;
  /** Set when shown as a "Vendor Top Search" promotion. */
  campaignId: string | null;
};
