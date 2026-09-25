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
};

export type FeedPageDTO = { items: PostDTO[]; nextCursor: string | null };
