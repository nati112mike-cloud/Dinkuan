/** Pure helpers shared by the server and the browser: usernames, tags, ranking maths. */

export const CAPTION_MAX = 2000;
export const BIO_MAX = 150;
export const COMMENT_MAX = 500;
export const EDIT_WINDOW_MS = 24 * 3600_000;
export const MAX_PHOTOS = 10;
export const MAX_VIDEO_S = 180;

export const INTERESTS = ["music", "nightlife", "weddings", "art", "comedy", "sports", "food"] as const;
export type InterestKey = (typeof INTERESTS)[number];

export const REACTIONS = ["like", "love", "haha", "fire", "wow", "sad", "clap"] as const;
export type ReactionKey = (typeof REACTIONS)[number];
export const REACTION_EMOJI: Record<ReactionKey, string> = {
  like: "👍",
  love: "❤️",
  haha: "😂",
  fire: "🔥",
  wow: "😮",
  sad: "😢",
  clap: "👏",
};

const RESERVED = new Set(["admin", "dinkuan", "api", "support", "help", "settings", "login", "me", "root", "moderator"]);

/** F14-AC1: Latin letters, numbers, `_` and `.`; 3–30 chars; stored lowercase. */
export function normalizeUsername(raw: string): string | null {
  const u = raw.trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_.]{3,30}$/.test(u)) return null;
  if (u.startsWith(".") || u.endsWith(".") || u.includes("..")) return null;
  if (RESERVED.has(u)) return null;
  return u;
}

/** A starting username from a display name; Amharic-only names fall back to "member". */
export function usernameBase(name: string | null | undefined): string {
  const latin = (name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
  return latin.length >= 3 ? latin : "member";
}

/** Hashtags in Amharic or English, lowercased and de-duplicated (F15-AC2). */
export function parseHashtags(text: string): string[] {
  const tags = [...text.matchAll(/#([\p{L}\p{M}\p{N}_]{1,50})/gu)].map((m) => m[1]!.toLowerCase());
  return [...new Set(tags)];
}

export function parseMentions(text: string): string[] {
  const names = [...text.matchAll(/(^|[^\w.])@([a-z0-9_.]{3,30})/gi)]
    .map((m) => normalizeUsername(m[2]!))
    .filter((u): u is string => !!u);
  return [...new Set(names)];
}

/** F16-AC3: owner's keyword filter; matches whole words or phrases, case-insensitive. */
export function matchesHiddenWord(body: string, words: string[]): boolean {
  const text = body.toLowerCase();
  return words.some((w) => {
    const word = w.trim().toLowerCase();
    return word.length > 0 && text.includes(word);
  });
}

// ---------------------------------------------------------------------------
// F16-AC6 For You ranking v1: score = engagement rate × recency decay × locality × relationship.
// Recency decay halves the score every HALF_LIFE_H hours. Storing
//   rankKey = ln(engagement × locality) + createdHours × ln2 / HALF_LIFE_H
// orders posts exactly like the decayed score at any moment, so the key only changes when
// engagement does and never needs a time-based recompute.

export const HALF_LIFE_H = 24;
export const LOCALITY_BOOST = 1.2;
export const FOLLOW_BOOST = 1.5;
export const SAME_EVENT_BOOST = 1.3;

export type RankInput = {
  reactionCount: number;
  commentCount: number;
  shareCount: number;
  completions: number;
  viewCount: number;
  createdAt: Date;
  addisTagged: boolean;
};

export function engagementRate(p: Omit<RankInput, "createdAt" | "addisTagged">): number {
  return (p.reactionCount + 2 * p.commentCount + 3 * p.shareCount + 2 * p.completions + 1) / (p.viewCount + 20);
}

export function rankKey(p: RankInput): number {
  const hours = p.createdAt.getTime() / 3600_000;
  return Math.log(engagementRate(p) * (p.addisTagged ? LOCALITY_BOOST : 1)) + (hours * Math.LN2) / HALF_LIFE_H;
}

/** The decayed score at `now`, for explaining a ranking (not used for ordering). */
export function scoreAt(p: RankInput, now: Date): number {
  return Math.exp(rankKey(p) - ((now.getTime() / 3600_000) * Math.LN2) / HALF_LIFE_H);
}
