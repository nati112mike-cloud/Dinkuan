import { DomainError } from "@dinkuan/core";
import { prisma, type Prisma } from "@dinkuan/db";
import type { ScreenCategory } from "./screen";

type Db = Prisma.TransactionClient | typeof prisma;

/** F22-AC3: everything a member can report. */
export const REPORT_TARGETS = ["post", "comment", "profile", "message", "review"] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const REPORT_REASONS = [
  "child_safety",
  "threat",
  "hate",
  "nudity",
  "violence",
  "harassment",
  "scam",
  "spam",
  "copyright",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** F22-AC7: threats, hate speech and child sexual content are urgent (1 hour); the rest 24 hours. */
export const REASON_SEVERITY: Record<ReportReason, number> = {
  child_safety: 4,
  threat: 4,
  hate: 4,
  nudity: 2,
  violence: 2,
  harassment: 2,
  scam: 2,
  copyright: 2,
  spam: 1,
  other: 1,
};

export const URGENT = 4;
export const URGENT_DUE_MS = 3600_000;
export const NORMAL_DUE_MS = 24 * 3600_000;
export const REPORTS_PER_HOUR = 30;

/** Finds who wrote the reported thing, checking the reporter is allowed to see it. */
export async function resolveTarget(
  db: Db,
  type: ReportTarget,
  id: string,
  viewerId: string | null,
): Promise<{ subjectId: string } | null> {
  switch (type) {
    case "post": {
      const p = await db.post.findUnique({ where: { id }, select: { authorId: true, status: true } });
      return p && p.status !== "removed" ? { subjectId: p.authorId } : null;
    }
    case "comment": {
      const c = await db.comment.findUnique({ where: { id }, select: { authorId: true, status: true } });
      return c && c.status !== "removed" ? { subjectId: c.authorId } : null;
    }
    case "profile": {
      const u = await db.user.findUnique({ where: { id }, select: { id: true } });
      return u ? { subjectId: u.id } : null;
    }
    case "message": {
      const m = await db.message.findUnique({ where: { id }, include: { conversation: true } });
      if (!m || m.removedAt) return null;
      // Only the two people in a conversation can see (and so report) its messages.
      if (viewerId && viewerId !== m.conversation.clientId && viewerId !== m.conversation.vendorId) return null;
      return { subjectId: m.senderId };
    }
    case "review": {
      const r = await db.review.findUnique({ where: { id }, select: { clientId: true, removedAt: true } });
      return r && !r.removedAt ? { subjectId: r.clientId } : null;
    }
  }
}

/**
 * F22-AC3: a member reports something. One report per person per target (a repeat returns the
 * first). Child sexual content is hidden straight away while it waits for a moderator (AC7).
 */
export async function fileReport(
  reporterId: string,
  input: { targetType: ReportTarget; targetId: string; reason: ReportReason; details?: string },
  now = new Date(),
) {
  const target = await resolveTarget(prisma, input.targetType, input.targetId, reporterId);
  if (!target) throw new DomainError("NOT_FOUND");
  if (target.subjectId === reporterId) throw new DomainError("VALIDATION", "You can't report yourself");
  const existing = await prisma.report.findFirst({
    where: { reporterId, targetType: input.targetType, targetId: input.targetId },
  });
  if (existing) return existing;
  const since = new Date(now.getTime() - 3600_000);
  if ((await prisma.report.count({ where: { reporterId, createdAt: { gte: since } } })) >= REPORTS_PER_HOUR) {
    throw new DomainError("RATE_LIMITED");
  }
  return prisma.$transaction(async (tx) => {
    const report = await tx.report.create({
      data: {
        reporterId,
        targetType: input.targetType,
        targetId: input.targetId,
        subjectId: target.subjectId,
        reason: input.reason,
        severity: REASON_SEVERITY[input.reason],
        details: input.details?.trim().slice(0, 1000) || null,
      },
    });
    if (input.reason === "child_safety") await hidePending(tx, input.targetType, input.targetId);
    return report;
  });
}

/** Takes a post or comment out of view until a moderator decides. Dismissing brings it back. */
async function hidePending(tx: Prisma.TransactionClient, type: ReportTarget, id: string) {
  if (type === "post") await tx.post.updateMany({ where: { id, status: "public" }, data: { status: "restricted" } });
  if (type === "comment") await tx.comment.updateMany({ where: { id, status: "visible" }, data: { status: "hidden" } });
}

/**
 * F22-AC2: automated screening flagged something. It joins the moderator queue as a report
 * with no reporter, once per target while it is open.
 */
export async function flagContent(
  db: Db,
  input: { targetType: ReportTarget; targetId: string; subjectId: string; category: ScreenCategory; severity: number },
) {
  const open = await db.report.findFirst({
    where: { reporterId: null, targetType: input.targetType, targetId: input.targetId, status: "open" },
  });
  if (open) {
    if (input.severity > open.severity) {
      await db.report.update({ where: { id: open.id }, data: { severity: input.severity, reason: input.category } });
    }
    return open;
  }
  return db.report.create({
    data: {
      reporterId: null,
      targetType: input.targetType,
      targetId: input.targetId,
      subjectId: input.subjectId,
      reason: input.category,
      severity: Math.max(1, input.severity),
    },
  });
}
