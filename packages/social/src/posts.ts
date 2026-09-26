import { DomainError } from "@dinkuan/core";
import { prisma, type Prisma } from "@dinkuan/db";
import { assertActive } from "@dinkuan/moderation";
import { z } from "zod";
import { assertUnderLimit } from "./limits";
import { notify } from "./notifications";
import { ensureProfile } from "./profiles";
import { screenPost } from "./screening";
import { CAPTION_MAX, EDIT_WINDOW_MS, MAX_PHOTOS, MAX_VIDEO_S, parseHashtags, parseMentions, rankKey } from "./text";
import { assertComplete, IMAGE_TYPES, mediaUrl, VIDEO_TYPES } from "./uploads";
import { visiblePostsWhere } from "./visibility";

type Db = Prisma.TransactionClient | typeof prisma;

const mediaInput = z.object({
  blobId: z.uuid(),
  thumbBlobId: z.uuid().optional(),
  width: z.number().int().positive().max(10_000),
  height: z.number().int().positive().max(10_000),
  durationS: z.number().int().positive().optional(),
});

export const postInput = z.object({
  type: z.enum(["text", "photo", "video", "meme", "reel"]),
  caption: z.string().max(CAPTION_MAX).default(""),
  audience: z.enum(["public", "followers"]).default("public"),
  eventId: z.uuid().nullable().optional(),
  venueId: z.uuid().nullable().optional(),
  media: z.array(mediaInput).max(MAX_PHOTOS).default([]),
});
export type PostInput = z.input<typeof postInput>;

/** Recomputes the For You rank key from a post's counters (F16-AC6). */
export async function refreshRank(db: Db, postId: string) {
  const p = await db.post.findUnique({ where: { id: postId } });
  if (!p) return;
  const key = rankKey({ ...p, addisTagged: !!(p.eventId || p.venueId) });
  await db.post.update({ where: { id: postId }, data: { rankKey: key } });
}

export async function syncTags(tx: Prisma.TransactionClient, postId: string, authorId: string, caption: string) {
  await tx.postHashtag.deleteMany({ where: { postId } });
  await tx.mention.deleteMany({ where: { postId } });
  for (const tag of parseHashtags(caption)) {
    const h = await tx.hashtag.upsert({ where: { tag }, create: { tag }, update: {} });
    await tx.postHashtag.create({ data: { postId, hashtagId: h.id } });
  }
  const names = parseMentions(caption);
  if (names.length) {
    const users = await tx.profile.findMany({
      where: {
        username: { in: names },
        user: { blocksMade: { none: { blockedId: authorId } }, blocksReceived: { none: { blockerId: authorId } } },
      },
      select: { userId: true },
    });
    for (const u of users) {
      await tx.mention.create({ data: { postId, userId: u.userId } });
      await notify(tx, { recipientId: u.userId, actorId: authorId, type: "mention", postId });
    }
  }
}

/** F15: create a post. It goes public only after screening (CLAUDE.md rule 14). */
export async function createPost(authorId: string, raw: PostInput) {
  const input = postInput.parse(raw);
  await ensureProfile(authorId);
  await assertActive(authorId);
  await assertUnderLimit("posts", authorId);
  const caption = input.caption.trim();

  const blobs = await Promise.all(input.media.map((m) => assertComplete(authorId, m.blobId)));
  const thumbs = await Promise.all(
    input.media.map((m) => (m.thumbBlobId ? assertComplete(authorId, m.thumbBlobId) : null)),
  );
  const images = blobs.filter((b) => IMAGE_TYPES.includes(b.contentType)).length;
  const videos = blobs.filter((b) => VIDEO_TYPES.includes(b.contentType)).length;
  const bad = (msg: string) => new DomainError("VALIDATION", msg);
  switch (input.type) {
    case "text":
      if (!caption) throw bad("Write something first");
      if (blobs.length) throw bad("Text posts have no media");
      break;
    case "photo":
      if (images < 1 || videos > 0) throw bad(`Add 1 to ${MAX_PHOTOS} photos`);
      break;
    case "meme":
      if (images !== 1 || blobs.length !== 1) throw bad("A meme is one image");
      break;
    case "video":
    case "reel":
      if (videos !== 1 || blobs.length !== 1) throw bad("Add one video");
      if ((input.media[0]!.durationS ?? 0) > MAX_VIDEO_S) throw bad("Videos can be up to 3 minutes");
      break;
  }
  thumbs.forEach((t) => {
    if (t && !IMAGE_TYPES.includes(t.contentType)) throw bad("Thumbnails must be images");
  });

  const post = await prisma.$transaction(async (tx) => {
    const created = await tx.post.create({
      data: {
        authorId,
        type: input.type,
        caption,
        audience: input.audience,
        eventId: input.eventId ?? null,
        venueId: input.venueId ?? null,
        status: "processing",
        media: {
          create: input.media.map((m, i) => ({
            kind: VIDEO_TYPES.includes(blobs[i]!.contentType) ? "video" : "image",
            url: mediaUrl(m.blobId),
            thumbUrl: m.thumbBlobId ? mediaUrl(m.thumbBlobId) : null,
            width: m.width,
            height: m.height,
            durationS: m.durationS ?? null,
            orderIdx: i,
          })),
        },
      },
    });
    await syncTags(tx, created.id, authorId, caption);
    await screenPost(tx, created.id, caption);
    await refreshRank(tx, created.id);
    await tx.profile.update({ where: { userId: authorId }, data: { postsCount: { increment: 1 } } });
    return created;
  });
  return prisma.post.findUniqueOrThrow({ where: { id: post.id } });
}

/** F15-AC4: captions can be edited within 24 hours. The new caption is screened again. */
export async function editCaption(authorId: string, postId: string, caption: string, now = new Date()) {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post || post.status === "removed") throw new DomainError("NOT_FOUND");
  if (post.authorId !== authorId) throw new DomainError("FORBIDDEN");
  await assertActive(authorId, now);
  if (now.getTime() - post.createdAt.getTime() > EDIT_WINDOW_MS) throw new DomainError("EDIT_WINDOW_CLOSED");
  const text = caption.trim().slice(0, CAPTION_MAX);
  if (post.type === "text" && !text) throw new DomainError("VALIDATION");
  return prisma.$transaction(async (tx) => {
    await tx.post.update({ where: { id: postId }, data: { caption: text, editedAt: now } });
    await syncTags(tx, postId, authorId, text);
    await screenPost(tx, postId, text);
    return tx.post.findUniqueOrThrow({ where: { id: postId } });
  });
}

/** F15-AC4: delete any time. */
export async function deletePost(userId: string, postId: string) {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw new DomainError("NOT_FOUND");
  if (post.authorId !== userId) throw new DomainError("FORBIDDEN");
  await prisma.$transaction(async (tx) => {
    await tx.post.delete({ where: { id: postId } });
    await tx.profile.update({
      where: { userId },
      data: { postsCount: { decrement: 1 }, likesReceived: { decrement: post.reactionCount } },
    });
  });
}

// ---------------------------------------------------------------------------
// Reading posts. Everything here goes through visiblePostsWhere (CLAUDE.md rule 15).

export const postInclude = {
  author: { select: { id: true, profile: true } },
  media: { orderBy: { orderIdx: "asc" } },
  event: { select: { id: true, slug: true, titleEn: true, titleAm: true, startsAt: true } },
  venue: { select: { id: true, name: true } },
} satisfies Prisma.PostInclude;

export type PostRow = Prisma.PostGetPayload<{ include: typeof postInclude }>;
export type PostView = PostRow & { myReaction: string | null; saved: boolean };

/** Adds the viewer's own reaction and saved state to each post. */
export async function withViewerState(posts: PostRow[], viewerId: string | null): Promise<PostView[]> {
  if (!viewerId || posts.length === 0) return posts.map((p) => ({ ...p, myReaction: null, saved: false }));
  const ids = posts.map((p) => p.id);
  const [reactions, saves] = await Promise.all([
    prisma.reaction.findMany({ where: { userId: viewerId, postId: { in: ids } } }),
    prisma.savedPost.findMany({ where: { userId: viewerId, postId: { in: ids } } }),
  ]);
  const r = new Map(reactions.map((x) => [x.postId, x.type]));
  const s = new Set(saves.map((x) => x.postId));
  return posts.map((p) => ({ ...p, myReaction: r.get(p.id) ?? null, saved: s.has(p.id) }));
}

export async function getPost(postId: string, viewerId: string | null): Promise<PostView | null> {
  const post = await prisma.post.findFirst({ where: { AND: [{ id: postId }, visiblePostsWhere(viewerId)] }, include: postInclude });
  if (!post) return null;
  return (await withViewerState([post], viewerId))[0]!;
}

type Page = { items: PostView[]; nextCursor: string | null };

async function pageByTime(where: Prisma.PostWhereInput, viewerId: string | null, cursor: string | null, take: number): Promise<Page> {
  const rows = await prisma.post.findMany({
    where,
    include: postInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const items = rows.slice(0, take);
  return { items: await withViewerState(items, viewerId), nextCursor: rows.length > take ? items.at(-1)!.id : null };
}

/** F14-AC2 profile tabs: Posts, Reels (videos) and Tagged. */
export async function profilePosts(
  authorId: string,
  tab: "posts" | "reels" | "tagged",
  viewerId: string | null,
  cursor: string | null = null,
  take = 24,
): Promise<Page> {
  const base = visiblePostsWhere(viewerId);
  const where: Prisma.PostWhereInput =
    tab === "tagged"
      ? { AND: [base, { mentions: { some: { userId: authorId } } }] }
      : { AND: [base, { authorId }, tab === "reels" ? { type: { in: ["video", "reel"] } } : {}] };
  return pageByTime(where, viewerId, cursor, take);
}

/** F15-AC5: posts tagged to an event are its "Moments". */
export async function eventMoments(eventId: string, viewerId: string | null, cursor: string | null = null, take = 12) {
  return pageByTime({ AND: [visiblePostsWhere(viewerId), { eventId }] }, viewerId, cursor, take);
}

export async function hashtagPosts(tag: string, viewerId: string | null, cursor: string | null = null, take = 24) {
  return pageByTime(
    { AND: [visiblePostsWhere(viewerId), { hashtags: { some: { hashtag: { tag: tag.toLowerCase() } } } }] },
    viewerId,
    cursor,
    take,
  );
}

export { pageByTime };
