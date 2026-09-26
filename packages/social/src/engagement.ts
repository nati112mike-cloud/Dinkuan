import { DomainError } from "@dinkuan/core";
import { prisma, type Prisma, type ReactionType, type ShareType } from "@dinkuan/db";
import { assertActive, fileReport, flagContent, REPORT_REASONS, screenText, type ReportReason, type ReportTarget } from "@dinkuan/moderation";
import { assertUnderLimit } from "./limits";
import { notify } from "./notifications";
import { refreshRank } from "./posts";
import { COMMENT_MAX, matchesHiddenWord } from "./text";
import { isBlockedEitherWay, visiblePostsWhere, visibleUsersWhere } from "./visibility";

async function visiblePost(postId: string, viewerId: string | null) {
  const post = await prisma.post.findFirst({ where: { AND: [{ id: postId }, await visiblePostsWhere(viewerId)] } });
  if (!post) throw new DomainError("NOT_FOUND");
  return post;
}

// ---------------------------------------------------------------------------
// F16-AC2 reactions: one per person per post (double-tap = like).

export async function react(userId: string, postId: string, type: ReactionType) {
  const post = await visiblePost(postId, userId);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.reaction.findUnique({ where: { userId_postId: { userId, postId } } });
    if (existing) {
      if (existing.type !== type) await tx.reaction.update({ where: { userId_postId: { userId, postId } }, data: { type } });
    } else {
      await tx.reaction.create({ data: { userId, postId, type } });
      await tx.post.update({ where: { id: postId }, data: { reactionCount: { increment: 1 } } });
      await tx.profile.update({ where: { userId: post.authorId }, data: { likesReceived: { increment: 1 } } });
      await notify(tx, { recipientId: post.authorId, actorId: userId, type: "reaction", postId });
      await refreshRank(tx, postId);
    }
    return { type, reactionCount: (await tx.post.findUniqueOrThrow({ where: { id: postId } })).reactionCount };
  });
}

export async function unreact(userId: string, postId: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.reaction.findUnique({ where: { userId_postId: { userId, postId } }, include: { post: true } });
    if (existing) {
      await tx.reaction.delete({ where: { userId_postId: { userId, postId } } });
      await tx.post.update({ where: { id: postId }, data: { reactionCount: { decrement: 1 } } });
      await tx.profile.update({ where: { userId: existing.post.authorId }, data: { likesReceived: { decrement: 1 } } });
      await refreshRank(tx, postId);
    }
    const post = await tx.post.findUnique({ where: { id: postId } });
    return { type: null, reactionCount: post?.reactionCount ?? 0 };
  });
}

// ---------------------------------------------------------------------------
// F16-AC3 comments: one level of replies, likes, pin, hide/delete on own posts, keyword filter.

export async function addComment(userId: string, postId: string, body: string, parentId?: string | null) {
  const text = body.trim();
  if (!text || text.length > COMMENT_MAX) throw new DomainError("VALIDATION");
  const post = await visiblePost(postId, userId);
  if (await isBlockedEitherWay(userId, post.authorId)) throw new DomainError("BLOCKED");
  await assertActive(userId);
  await assertUnderLimit("comments", userId);
  let parent = null;
  if (parentId) {
    parent = await prisma.comment.findUnique({ where: { id: parentId } });
    if (!parent || parent.postId !== postId || parent.status === "removed") throw new DomainError("NOT_FOUND");
    // One level of replies: a reply to a reply attaches to the top-level comment.
    if (parent.parentId) parent = await prisma.comment.findUniqueOrThrow({ where: { id: parent.parentId } });
  }
  const owner = await prisma.profile.findUnique({ where: { userId: post.authorId } });
  // F22-AC2: comments are screened too; flagged ones wait hidden in the moderator queue.
  const screened = screenText(text);
  const hidden = screened.status !== "public" || (userId !== post.authorId && matchesHiddenWord(text, owner?.hiddenWords ?? []));
  return prisma.$transaction(async (tx) => {
    const comment = await tx.comment.create({
      data: {
        postId,
        authorId: userId,
        parentId: parent?.id ?? null,
        body: text,
        status: screened.status === "removed" ? "removed" : hidden ? "hidden" : "visible",
      },
    });
    if (screened.category) {
      await flagContent(tx, { targetType: "comment", targetId: comment.id, subjectId: userId, category: screened.category, severity: screened.severity });
    }
    if (!hidden) {
      await tx.post.update({ where: { id: postId }, data: { commentCount: { increment: 1 } } });
      await refreshRank(tx, postId);
      await notify(tx, { recipientId: post.authorId, actorId: userId, type: "comment", postId });
      if (parent && parent.authorId !== post.authorId) {
        await notify(tx, { recipientId: parent.authorId, actorId: userId, type: "reply", postId });
      }
    }
    return comment;
  });
}

/**
 * Comments on a post as `viewer` sees them: pinned first, then oldest first, with replies.
 * Hidden comments are shown only to the person who wrote them; blocked people are left out.
 */
export async function listComments(postId: string, viewerId: string | null) {
  await visiblePost(postId, viewerId);
  const statusFilter: Prisma.CommentWhereInput = viewerId
    ? { OR: [{ status: "visible" }, { status: "hidden", authorId: viewerId }] }
    : { status: "visible" };
  const where: Prisma.CommentWhereInput = { AND: [{ postId }, statusFilter, { author: visibleUsersWhere(viewerId) }] };
  const rows = await prisma.comment.findMany({
    where,
    orderBy: [{ pinned: "desc" }, { createdAt: "asc" }],
    // Only public profile fields: this goes to the browser.
    include: {
      author: {
        select: { id: true, profile: { select: { username: true, displayName: true, avatarUrl: true, isVerified: true } } },
      },
    },
    take: 500,
  });
  const liked = viewerId
    ? new Set(
        (await prisma.commentLike.findMany({ where: { userId: viewerId, commentId: { in: rows.map((r) => r.id) } } })).map(
          (l) => l.commentId,
        ),
      )
    : new Set<string>();
  const shaped = rows.map((r) => ({ ...r, likedByMe: liked.has(r.id) }));
  const top = shaped.filter((c) => !c.parentId);
  return top.map((c) => ({ ...c, replies: shaped.filter((r) => r.parentId === c.id) }));
}

export async function toggleCommentLike(userId: string, commentId: string) {
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment || comment.status === "removed") throw new DomainError("NOT_FOUND");
  await visiblePost(comment.postId, userId);
  return prisma.$transaction(async (tx) => {
    const key = { userId_commentId: { userId, commentId } };
    const existing = await tx.commentLike.findUnique({ where: key });
    if (existing) await tx.commentLike.delete({ where: key });
    else await tx.commentLike.create({ data: { userId, commentId } });
    const updated = await tx.comment.update({
      where: { id: commentId },
      data: { likeCount: { increment: existing ? -1 : 1 } },
    });
    return { liked: !existing, likeCount: updated.likeCount };
  });
}

async function commentOnOwnPost(ownerId: string, commentId: string) {
  const comment = await prisma.comment.findUnique({ where: { id: commentId }, include: { post: true } });
  if (!comment) throw new DomainError("NOT_FOUND");
  if (comment.post.authorId !== ownerId) throw new DomainError("FORBIDDEN");
  return comment;
}

/** Post owner pins one top-level comment. */
export async function pinComment(ownerId: string, commentId: string) {
  const comment = await commentOnOwnPost(ownerId, commentId);
  if (comment.parentId) throw new DomainError("VALIDATION", "Only top-level comments can be pinned");
  const pin = !comment.pinned;
  await prisma.$transaction([
    prisma.comment.updateMany({ where: { postId: comment.postId, pinned: true }, data: { pinned: false } }),
    prisma.comment.update({ where: { id: commentId }, data: { pinned: pin } }),
  ]);
  return { pinned: pin };
}

/** Post owner hides a comment (the writer still sees it). */
export async function hideComment(ownerId: string, commentId: string) {
  const comment = await commentOnOwnPost(ownerId, commentId);
  if (comment.status !== "visible") return;
  await prisma.$transaction([
    prisma.comment.update({ where: { id: commentId }, data: { status: "hidden", pinned: false } }),
    prisma.post.update({ where: { id: comment.postId }, data: { commentCount: { decrement: 1 } } }),
  ]);
}

/** The writer or the post owner deletes a comment. */
export async function deleteComment(userId: string, commentId: string) {
  const comment = await prisma.comment.findUnique({ where: { id: commentId }, include: { post: true } });
  if (!comment || comment.status === "removed") throw new DomainError("NOT_FOUND");
  if (comment.authorId !== userId && comment.post.authorId !== userId) throw new DomainError("FORBIDDEN");
  await prisma.$transaction(async (tx) => {
    const replies = await tx.comment.count({ where: { parentId: commentId, status: "visible" } });
    await tx.comment.updateMany({ where: { OR: [{ id: commentId }, { parentId: commentId }] }, data: { status: "removed", pinned: false } });
    const lost = (comment.status === "visible" ? 1 : 0) + replies;
    if (lost) await tx.post.update({ where: { id: comment.postId }, data: { commentCount: { decrement: lost } } });
  });
}

// ---------------------------------------------------------------------------
// F16-AC4 share, F16-AC5 save, F16-AC9 watch tracking.

export async function sharePost(userId: string, postId: string, type: ShareType, comment?: string) {
  await visiblePost(postId, userId);
  await assertActive(userId);
  if (comment && screenText(comment).status !== "public") throw new DomainError("CONTENT_FLAGGED");
  return prisma.$transaction(async (tx) => {
    const share = await tx.share.create({ data: { postId, userId, type, comment: comment?.trim().slice(0, 500) || null } });
    await tx.post.update({ where: { id: postId }, data: { shareCount: { increment: 1 } } });
    await refreshRank(tx, postId);
    return share;
  });
}

export async function toggleSave(userId: string, postId: string, collection = "") {
  await visiblePost(postId, userId);
  const key = { userId_postId: { userId, postId } };
  const existing = await prisma.savedPost.findUnique({ where: key });
  if (existing && existing.collection === collection.trim()) {
    await prisma.savedPost.delete({ where: key });
    return { saved: false };
  }
  await prisma.savedPost.upsert({
    where: key,
    create: { userId, postId, collection: collection.trim().slice(0, 40) },
    update: { collection: collection.trim().slice(0, 40) },
  });
  return { saved: true };
}

/** Saved posts grouped into private collections ("" is the default "All saved"). */
export async function savedPosts(userId: string) {
  const rows = await prisma.savedPost.findMany({
    where: { userId, post: await visiblePostsWhere(userId) },
    orderBy: { createdAt: "desc" },
    include: { post: { include: { media: { orderBy: { orderIdx: "asc" }, take: 1 } } } },
    take: 300,
  });
  const collections = [...new Set(rows.map((r) => r.collection).filter(Boolean))];
  return { rows, collections };
}

export async function recordView(postId: string, viewerId: string | null, watchedMs: number, completed: boolean) {
  await visiblePost(postId, viewerId);
  await prisma.$transaction(async (tx) => {
    await tx.watchEvent.create({ data: { postId, userId: viewerId, watchedMs: Math.max(0, Math.round(watchedMs)), completed } });
    await tx.post.update({
      where: { id: postId },
      data: { viewCount: { increment: 1 }, ...(completed ? { completions: { increment: 1 } } : {}) },
    });
    await refreshRank(tx, postId);
  });
}

// ---------------------------------------------------------------------------
// F22-AC3 reports: the moderation package owns reasons, targets and the queue.

export { REPORT_REASONS };

export async function report(
  reporterId: string,
  input: { targetType: ReportTarget; targetId: string; reason: ReportReason; details?: string },
) {
  return fileReport(reporterId, input);
}
