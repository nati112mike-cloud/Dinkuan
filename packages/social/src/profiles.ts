import { randomBytes } from "node:crypto";
import { ageGroup, DomainError } from "@dinkuan/core";
import { prisma, type Prisma, type Profile } from "@dinkuan/db";
import { assertActive, screenText } from "@dinkuan/moderation";
import { z } from "zod";
import { BIO_MAX, INTERESTS, normalizeUsername, usernameBase } from "./text";
import { visibleUsersWhere } from "./visibility";

function referralCode() {
  return randomBytes(6).toString("base64url").replace(/[-_]/g, "x").slice(0, 8).toUpperCase();
}

/** Every member gets a profile the first time they need one, with a username they can change. */
export async function ensureProfile(userId: string, opts: { referralCode?: string | null } = {}): Promise<Profile> {
  const existing = await prisma.profile.findUnique({ where: { userId } });
  if (existing) return existing;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const base = usernameBase(user.name);
  const referrer = opts.referralCode
    ? await prisma.profile.findUnique({ where: { referralCode: opts.referralCode.toUpperCase() } })
    : null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const suffix = attempt === 0 && base !== "member" ? "" : `_${Math.floor(1000 + Math.random() * 9000)}`;
    try {
      return await prisma.profile.create({
        data: {
          userId,
          username: `${base}${suffix}`,
          displayName: user.name ?? "",
          // F22-AC8: teen accounts are private by default.
          isPrivate: ageGroup(user.birthDate) === "teen",
          referralCode: referralCode(),
          referredById: referrer && referrer.userId !== userId ? referrer.userId : null,
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e;
      const raced = await prisma.profile.findUnique({ where: { userId } });
      if (raced) return raced;
    }
  }
  throw new DomainError("USERNAME_TAKEN");
}

export const profileInput = z.object({
  username: z.string().optional(),
  displayName: z.string().trim().min(1).max(50).optional(),
  bio: z.string().trim().max(BIO_MAX).optional(),
  link: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === "" || /^https?:\/\/\S+$/.test(v), "Link must start with http:// or https://")
    .optional(),
  subCity: z.string().trim().max(40).optional(),
  avatarUrl: z.string().max(300).nullable().optional(),
  coverUrl: z.string().max(300).nullable().optional(),
  isPrivate: z.boolean().optional(),
  lowDataMode: z.boolean().optional(),
  showEvents: z.boolean().optional(),
  creatorMode: z.boolean().optional(),
  hiddenWords: z.array(z.string().trim().min(1).max(40)).max(50).optional(),
  onboarded: z.boolean().optional(),
});

/** F14-AC1/AC4: edit profile. Switching to public accepts pending follow requests. */
export async function updateProfile(userId: string, raw: z.input<typeof profileInput>): Promise<Profile> {
  const input = profileInput.parse(raw);
  const current = await ensureProfile(userId);
  await assertActive(userId);
  // F22-AC2: names, bios and links are public, so they are screened before they are saved.
  const shown = [input.displayName, input.bio, input.link, input.username].filter(Boolean).join("\n");
  if (shown && screenText(shown).status !== "public") throw new DomainError("CONTENT_FLAGGED");
  const data: Prisma.ProfileUpdateInput = { ...input, username: undefined };
  if (input.username !== undefined) {
    const u = normalizeUsername(input.username);
    if (!u) throw new DomainError("USERNAME_INVALID");
    if (u !== current.username) {
      const taken = await prisma.profile.findUnique({ where: { username: u } });
      if (taken) throw new DomainError("USERNAME_TAKEN");
      data.username = u;
    }
  }
  if (input.link === "") data.link = null;
  if (input.bio === "") data.bio = null;
  return prisma.$transaction(async (tx) => {
    const updated = await tx.profile.update({ where: { userId }, data });
    if (input.displayName) await tx.user.update({ where: { id: userId }, data: { name: input.displayName } });
    if (current.isPrivate && input.isPrivate === false) {
      const pending = await tx.follow.findMany({ where: { followeeId: userId, status: "requested" }, select: { followerId: true } });
      if (pending.length > 0) {
        const ids = pending.map((r) => r.followerId);
        await tx.follow.updateMany({ where: { followeeId: userId, followerId: { in: ids } }, data: { status: "active" } });
        await tx.profile.update({ where: { userId }, data: { followersCount: { increment: ids.length } } });
        await tx.profile.updateMany({ where: { userId: { in: ids } }, data: { followingCount: { increment: 1 } } });
        return tx.profile.findUniqueOrThrow({ where: { userId } });
      }
    }
    return updated;
  });
}

/** F17-AC1: interests picked during onboarding. */
export async function setInterests(userId: string, keys: string[]) {
  const valid = keys.filter((k): k is (typeof INTERESTS)[number] => (INTERESTS as readonly string[]).includes(k));
  const rows = await Promise.all(
    valid.map((key) => prisma.interest.upsert({ where: { key }, create: { key }, update: {} })),
  );
  await prisma.$transaction([
    prisma.userInterest.deleteMany({ where: { userId } }),
    prisma.userInterest.createMany({ data: rows.map((r) => ({ userId, interestId: r.id })) }),
  ]);
  return valid;
}

export type Badge = "verified" | "creator" | "organiser";

export async function badgesFor(userId: string, profile: Pick<Profile, "isVerified" | "creatorMode">): Promise<Badge[]> {
  const badges: Badge[] = [];
  if (profile.isVerified) badges.push("verified");
  if (profile.creatorMode) badges.push("creator");
  const organiser = await prisma.organiser.count({ where: { ownerUserId: userId, status: "approved" } });
  if (organiser > 0) badges.push("organiser");
  return badges;
}

export type Relationship = {
  isSelf: boolean;
  following: "none" | "requested" | "active";
  followsYou: boolean;
  blocked: boolean;
  muted: boolean;
};

export async function relationship(viewerId: string | null, targetId: string): Promise<Relationship> {
  if (!viewerId) return { isSelf: false, following: "none", followsYou: false, blocked: false, muted: false };
  const [out, inc, block, mute] = await Promise.all([
    prisma.follow.findUnique({ where: { followerId_followeeId: { followerId: viewerId, followeeId: targetId } } }),
    prisma.follow.findUnique({ where: { followerId_followeeId: { followerId: targetId, followeeId: viewerId } } }),
    prisma.block.findUnique({ where: { blockerId_blockedId: { blockerId: viewerId, blockedId: targetId } } }),
    prisma.mute.findUnique({ where: { muterId_mutedId: { muterId: viewerId, mutedId: targetId } } }),
  ]);
  return {
    isSelf: viewerId === targetId,
    following: out ? out.status : "none",
    followsYou: inc?.status === "active",
    blocked: !!block,
    muted: !!mute,
  };
}

/**
 * F14: a profile as `viewer` sees it, or null when either side blocked the other
 * (blocked people can no longer see each other).
 */
export async function getProfileView(username: string, viewerId: string | null) {
  const profile = await prisma.profile.findFirst({
    where: { username: username.toLowerCase(), user: visibleUsersWhere(viewerId) },
  });
  if (!profile) return null;
  const rel = await relationship(viewerId, profile.userId);
  if (rel.blocked) return null;
  const canSeePosts = !profile.isPrivate || rel.isSelf || rel.following === "active";
  return { profile, rel, canSeePosts, badges: await badgesFor(profile.userId, profile) };
}

/** F14-AC2 Events tab: events the member is going to or went to, if they show them. */
export async function profileEvents(userId: string) {
  const tickets = await prisma.ticket.findMany({
    where: { holderUserId: userId, status: { in: ["valid", "checked_in"] }, event: { status: "published" } },
    select: { event: { include: { venue: true } } },
    distinct: ["eventId"],
    take: 30,
  });
  return tickets.map((t) => t.event).sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
}

/** F17-AC4: search people by name or @username, Amharic or English. */
export async function searchPeople(q: string, viewerId: string | null, limit = 20) {
  const term = q.trim().replace(/^@/, "");
  if (!term) return [];
  return prisma.profile.findMany({
    where: {
      user: visibleUsersWhere(viewerId),
      OR: [
        { username: { contains: term.toLowerCase() } },
        { displayName: { contains: term, mode: "insensitive" } },
      ],
    },
    orderBy: { followersCount: "desc" },
    take: limit,
  });
}

export async function followList(userId: string, which: "followers" | "following", viewerId: string | null) {
  const rows = await prisma.follow.findMany({
    where:
      which === "followers"
        ? { followeeId: userId, status: "active", follower: visibleUsersWhere(viewerId) }
        : { followerId: userId, status: "active", followee: visibleUsersWhere(viewerId) },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      follower: { select: { profile: true } },
      followee: { select: { profile: true } },
    },
  });
  return rows
    .map((r) => (which === "followers" ? r.follower.profile : r.followee.profile))
    .filter((p): p is Profile => !!p);
}
