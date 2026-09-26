import { randomBytes } from "node:crypto";
import { DomainError } from "@dinkuan/core";
import { prisma } from "@dinkuan/db";
import { visibleUsersWhere } from "@dinkuan/social";
import { cardInclude } from "./search";

const token = () => randomBytes(9).toString("base64url");

/** Each member has one shortlist for now; it is created the first time they save a vendor. */
async function ensureShortlist(userId: string) {
  const existing = await prisma.shortlist.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } });
  return existing ?? prisma.shortlist.create({ data: { userId, name: "Shortlist", shareToken: token() } });
}

/** F20-AC13: save or unsave a vendor. Returns whether the vendor is now saved. */
export async function toggleShortlist(userId: string, vendorId: string): Promise<boolean> {
  if (!(await prisma.vendorProfile.findUnique({ where: { userId: vendorId } }))) throw new DomainError("NOT_FOUND");
  const list = await ensureShortlist(userId);
  const key = { shortlistId_vendorId: { shortlistId: list.id, vendorId } };
  if (await prisma.shortlistItem.findUnique({ where: key })) {
    await prisma.shortlistItem.delete({ where: key });
    return false;
  }
  await prisma.shortlistItem.create({ data: { shortlistId: list.id, vendorId } });
  return true;
}

export async function shortlistedIds(userId: string | null): Promise<Set<string>> {
  if (!userId) return new Set();
  const rows = await prisma.shortlistItem.findMany({ where: { shortlist: { userId } }, select: { vendorId: true } });
  return new Set(rows.map((r) => r.vendorId));
}

export async function myShortlist(userId: string) {
  const list = await ensureShortlist(userId);
  return loadShortlist(list.id, userId);
}

/**
 * F20-AC13: a shortlist can be opened by anyone with its link, so family can look together
 * (the link is shared on Telegram). Blocked vendors still stay hidden from the viewer.
 */
export async function shortlistByToken(shareToken: string, viewerId: string | null) {
  const list = await prisma.shortlist.findUnique({ where: { shareToken } });
  return list ? loadShortlist(list.id, viewerId) : null;
}

async function loadShortlist(id: string, viewerId: string | null) {
  const list = await prisma.shortlist.findUniqueOrThrow({
    where: { id },
    include: {
      user: { select: { profile: { select: { displayName: true, username: true } } } },
      items: {
        where: { vendor: { user: visibleUsersWhere(viewerId) } },
        orderBy: { createdAt: "desc" },
        include: { vendor: { include: cardInclude } },
      },
    },
  });
  return list;
}
