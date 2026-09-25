import { prisma, type ContentStatus, type Prisma } from "@dinkuan/db";

/**
 * CLAUDE.md rule 14 / F22-AC2: nothing goes public before screening.
 * Demo stand-in: images and video are auto-approved and captions are checked against a short
 * spam list. The real screening provider (images, video, Amharic/Afaan Oromo/English text) plugs
 * in here and can send borderline posts to the moderator queue as `restricted`.
 */
const SPAM_PATTERNS = [/\bbit\.ly\//i, /\btinyurl\.com\//i, /\bfree\s+money\b/i, /\bcrypto\s+giveaway\b/i];

export type ScreeningResult = { status: Extract<ContentStatus, "public" | "restricted">; reason?: string };

export function screenText(text: string): ScreeningResult {
  const hit = SPAM_PATTERNS.find((p) => p.test(text));
  return hit ? { status: "restricted", reason: "spam_link" } : { status: "public" };
}

/** Moves a post processing → screening → public | restricted. */
export async function screenPost(tx: Prisma.TransactionClient | typeof prisma, postId: string, caption: string) {
  await tx.post.update({ where: { id: postId }, data: { status: "screening" } });
  const result = screenText(caption);
  await tx.post.update({ where: { id: postId }, data: { status: result.status } });
  return result;
}
