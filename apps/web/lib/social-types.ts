/** Shapes passed from the server to social client components (JSON-safe). */
export type ProfileDTO = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  isPrivate: boolean;
};

export type MediaDTO = {
  kind: "image" | "video";
  url: string;
  lowUrl: string | null;
  thumbUrl: string | null;
  width: number;
  height: number;
  durationS: number | null;
};

export type PostDTO = {
  id: string;
  type: "text" | "photo" | "video" | "meme" | "reel";
  caption: string;
  audience: "public" | "followers";
  status: string;
  createdAt: string;
  edited: boolean;
  reactionCount: number;
  commentCount: number;
  shareCount: number;
  viewCount: number;
  author: ProfileDTO;
  media: MediaDTO[];
  event: { slug: string; title: string } | null;
  myReaction: string | null;
  saved: boolean;
  isMine: boolean;
  /** Set when this post is shown as a promotion (F21-AC6: always labelled). */
  sponsored?: SponsoredDTO | null;
};

export type SponsoredDTO = { campaignId: string; placement: "feed" | "reels" | "events_featured" | "home_weekend" | "search_top" };

export type FeedPageDTO = { items: PostDTO[]; nextCursor: string | null };
