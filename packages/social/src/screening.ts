import { prisma, type Prisma } from "@dinkuan/db";
import { flagContent, hasMediaScreener, screenMedia, screenText, worstOf, type ScreeningResult } from "@dinkuan/moderation";

export { screenText, type ScreeningResult } from "@dinkuan/moderation";

/**
 * CLAUDE.md rule 14 / F22-AC2: a post moves processing → screening → public | restricted | removed.
 * Captions go through the keyword screener and media through the image/video screener. Anything
 * that isn't clean joins the moderator queue.
 */
export async function screenPost(tx: Prisma.TransactionClient | typeof prisma, postId: string, caption: string) {
  const post = await tx.post.update({ where: { id: postId }, data: { status: "screening" }, include: { media: true } });
  const blobIds = post.media.flatMap((m) => [m.url, m.thumbUrl]).map((u) => u?.match(/^\/api\/media\/([\w-]+)$/)?.[1]).filter((x): x is string => !!x);
  const blobs = blobIds.length
    ? await tx.mediaBlob.findMany({ where: { id: { in: blobIds } }, select: { contentType: true, bytes: hasMediaScreener() } })
    : [];
  const media = blobs.map((b) => ({ contentType: b.contentType, bytes: b.bytes ?? new Uint8Array() }));
  const result = worstOf(screenText(caption), await screenMedia(media));
  await tx.post.update({ where: { id: postId }, data: { status: result.status } });
  if (result.status !== "public" && result.category) {
    await flagContent(tx, { targetType: "post", targetId: postId, subjectId: post.authorId, category: result.category, severity: result.severity });
  }
  return result as ScreeningResult;
}
