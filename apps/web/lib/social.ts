import "server-only";
import { cookies } from "next/headers";
import type { Profile } from "@dinkuan/db";
import type { Lang } from "@dinkuan/i18n";
import { ensureProfile, type PostView } from "@dinkuan/social";
import type { PostDTO, ProfileDTO } from "./social-types";
import { eventTitle } from "./format";
import { currentUser } from "./session";

export const REF_COOKIE = "dk_ref";

/** The logged-in member and their profile (created on first use, crediting any invite link). */
export async function currentMember() {
  const user = await currentUser();
  if (!user) return null;
  const ref = (await cookies()).get(REF_COOKIE)?.value ?? null;
  const profile = await ensureProfile(user.id, { referralCode: ref });
  return { user, profile };
}

export function toProfileDTO(p: Profile): ProfileDTO {
  return {
    userId: p.userId,
    username: p.username,
    displayName: p.displayName || p.username,
    avatarUrl: p.avatarUrl,
    isVerified: p.isVerified,
    isPrivate: p.isPrivate,
  };
}

export function toPostDTO(p: PostView, viewerId: string | null, lang: Lang): PostDTO {
  const profile = p.author.profile;
  return {
    id: p.id,
    type: p.type,
    caption: p.caption,
    audience: p.audience,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    edited: !!p.editedAt,
    reactionCount: p.reactionCount,
    commentCount: p.commentCount,
    shareCount: p.shareCount,
    viewCount: p.viewCount,
    author: profile
      ? toProfileDTO(profile)
      : { userId: p.authorId, username: "member", displayName: "Member", avatarUrl: null, isVerified: false, isPrivate: false },
    media: p.media.map((m) => ({
      kind: m.kind,
      url: m.url,
      lowUrl: m.lowUrl,
      thumbUrl: m.thumbUrl,
      width: m.width,
      height: m.height,
      durationS: m.durationS,
    })),
    event: p.event ? { slug: p.event.slug, title: eventTitle(p.event, lang) } : null,
    myReaction: p.myReaction,
    saved: p.saved,
    isMine: viewerId === p.authorId,
  };
}
