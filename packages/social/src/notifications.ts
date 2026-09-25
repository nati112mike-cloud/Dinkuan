import { prisma, type NotificationType, type Prisma } from "@dinkuan/db";
import { visibleUsersWhere } from "./visibility";

type Db = Prisma.TransactionClient | typeof prisma;

export async function notify(
  db: Db,
  n: { recipientId: string; actorId: string; type: NotificationType; postId?: string | null },
) {
  if (n.recipientId === n.actorId) return;
  await db.notification.create({ data: { ...n, postId: n.postId ?? null } });
}

export async function listNotifications(userId: string, limit = 50) {
  return prisma.notification.findMany({
    where: { recipientId: userId, actor: visibleUsersWhere(userId) },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: { select: { id: true, profile: true } } },
  });
}

export async function unreadCount(userId: string) {
  return prisma.notification.count({ where: { recipientId: userId, readAt: null } });
}

export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({ where: { recipientId: userId, readAt: null }, data: { readAt: new Date() } });
}
