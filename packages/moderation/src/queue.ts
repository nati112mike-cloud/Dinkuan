import { prisma } from "@dinkuan/db";
import { liveStrikes } from "./actions";
import { NORMAL_DUE_MS, URGENT, URGENT_DUE_MS, type ReportTarget } from "./reports";

export type QueuePreview = {
  text: string | null;
  images: string[];
  status: string | null;
  href: string | null;
};

export type QueueItem = {
  targetType: ReportTarget;
  targetId: string;
  severity: number;
  reports: number;
  automated: boolean;
  reasons: { reason: string; count: number }[];
  details: string[];
  oldestAt: Date;
  dueAt: Date;
  overdue: boolean;
  subject: { id: string; username: string | null; displayName: string | null; strikes: number; state: "active" | "suspended" | "banned" } | null;
  preview: QueuePreview;
};

async function preview(type: ReportTarget, id: string): Promise<QueuePreview> {
  switch (type) {
    case "post": {
      const p = await prisma.post.findUnique({ where: { id }, include: { media: { orderBy: { orderIdx: "asc" }, take: 4 } } });
      return p
        ? { text: p.caption, images: p.media.map((m) => m.thumbUrl ?? (m.kind === "image" ? m.url : "")).filter(Boolean), status: p.status, href: `/p/${p.id}` }
        : { text: null, images: [], status: null, href: null };
    }
    case "comment": {
      const c = await prisma.comment.findUnique({ where: { id } });
      return { text: c?.body ?? null, images: [], status: c?.status ?? null, href: c ? `/p/${c.postId}` : null };
    }
    case "profile": {
      const p = await prisma.profile.findUnique({ where: { userId: id } });
      return {
        text: p ? [p.displayName, p.bio].filter(Boolean).join(" · ") : null,
        images: [p?.avatarUrl, p?.coverUrl].filter((x): x is string => !!x),
        status: null,
        href: p ? `/u/${p.username}` : null,
      };
    }
    case "message": {
      // Moderators see the original words, not the contact-masked copy.
      const m = await prisma.message.findUnique({ where: { id } });
      return { text: m?.originalBody ?? null, images: [], status: m?.removedAt ? "removed" : null, href: null };
    }
    case "review": {
      const r = await prisma.review.findUnique({ where: { id } });
      return { text: r?.body ?? null, images: [], status: r?.removedAt ? "removed" : null, href: null };
    }
  }
}

/**
 * F22-AC4: the moderator queue. Open reports are grouped by what they're about and sorted by
 * severity, then by how many people reported it, then oldest first. Urgent items are due within
 * an hour of the first report and the rest within 24 hours (AC7).
 */
export async function moderationQueue(now = new Date(), take = 50): Promise<QueueItem[]> {
  const groups = await prisma.report.groupBy({
    by: ["targetType", "targetId"],
    where: { status: "open" },
    _max: { severity: true },
    _count: { _all: true },
    _min: { createdAt: true },
    orderBy: [{ _max: { severity: "desc" } }, { _count: { targetId: "desc" } }, { _min: { createdAt: "asc" } }],
    take,
  });
  return Promise.all(
    groups.map(async (g) => {
      const type = g.targetType as ReportTarget;
      const reports = await prisma.report.findMany({ where: { targetType: type, targetId: g.targetId, status: "open" }, orderBy: { createdAt: "asc" } });
      const counts = new Map<string, number>();
      for (const r of reports) counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
      const severity = g._max.severity ?? 1;
      const oldestAt = g._min.createdAt ?? now;
      const dueAt = new Date(oldestAt.getTime() + (severity >= URGENT ? URGENT_DUE_MS : NORMAL_DUE_MS));
      const subjectId = reports.find((r) => r.subjectId)?.subjectId ?? null;
      const subjectUser = subjectId
        ? await prisma.user.findUnique({ where: { id: subjectId }, select: { id: true, bannedAt: true, suspendedUntil: true, profile: { select: { username: true, displayName: true } } } })
        : null;
      return {
        targetType: type,
        targetId: g.targetId,
        severity,
        reports: g._count._all,
        automated: reports.some((r) => r.reporterId === null),
        reasons: [...counts].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
        details: reports.map((r) => r.details).filter((d): d is string => !!d).slice(0, 3),
        oldestAt,
        dueAt,
        overdue: dueAt < now,
        subject: subjectUser
          ? {
              id: subjectUser.id,
              username: subjectUser.profile?.username ?? null,
              displayName: subjectUser.profile?.displayName ?? null,
              strikes: await liveStrikes(prisma, subjectUser.id, now),
              state: subjectUser.bannedAt ? "banned" : subjectUser.suspendedUntil && subjectUser.suspendedUntil > now ? "suspended" : "active",
            }
          : null,
        preview: await preview(type, g.targetId),
      } satisfies QueueItem;
    }),
  );
}

export async function openReportCount() {
  const rows = await prisma.report.groupBy({ by: ["targetType", "targetId"], where: { status: "open" } });
  return rows.length;
}
