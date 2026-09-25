import { prisma, type NotificationType, type Organiser, type Prisma } from "@dinkuan/db";
import { z } from "zod";
import { DomainError } from "../errors";
import { normalizeEthiopianPhone } from "../phone";
import { audit } from "./audit";

type Db = Prisma.TransactionClient | typeof prisma;

/** In-app notification (the social package's inbox). Written here so core has no social dependency. */
export async function notifyUser(
  db: Db,
  n: { recipientId: string; actorId: string; type: NotificationType; href: string },
) {
  if (n.recipientId === n.actorId) return;
  await db.notification.create({ data: { ...n, postId: null } });
}

export type OrganiserAccess = "owner" | "manager" | "scanner" | "admin";

/**
 * CLAUDE.md rule 7: who may act for an organiser. Owners and managers run events; scanners only
 * check tickets in; admins may do anything (and are audit-logged).
 */
export async function organiserAccess(userId: string, organiserId: string): Promise<OrganiserAccess | null> {
  const [org, member, admin] = await Promise.all([
    prisma.organiser.findUnique({ where: { id: organiserId }, select: { ownerUserId: true } }),
    prisma.organiserMember.findUnique({ where: { organiserId_userId: { organiserId, userId } } }),
    prisma.userRole.findFirst({ where: { userId, role: "admin" } }),
  ]);
  if (!org) throw new DomainError("NOT_FOUND");
  if (org.ownerUserId === userId) return "owner";
  if (member) return member.role;
  return admin ? "admin" : null;
}

/** Throws FORBIDDEN unless the user can manage this organiser's events (owner, manager or admin). */
export async function assertCanManage(userId: string, organiserId: string) {
  const access = await organiserAccess(userId, organiserId);
  if (!access || access === "scanner") throw new DomainError("FORBIDDEN");
  return access;
}

/** Organisers this person owns or manages, newest first. */
export function myOrganisers(userId: string) {
  return prisma.organiser.findMany({
    where: { OR: [{ ownerUserId: userId }, { members: { some: { userId, role: "manager" } } }] },
    orderBy: { createdAt: "desc" },
  });
}

const payoutAccount = z.string().trim().min(5).max(60);

export const organiserInput = z
  .object({
    type: z.enum(["business", "individual"]),
    name: z.string().trim().min(2).max(80),
    tin: z
      .string()
      .trim()
      .regex(/^\d{10}$/, "TIN is 10 digits")
      .optional()
      .nullable(),
    licenceUrl: z.string().max(300).optional().nullable(),
    payoutMethod: z.enum(["telebirr", "bank"]),
    payoutAccount,
  })
  .superRefine((v, ctx) => {
    if (v.payoutMethod === "telebirr" && !normalizeEthiopianPhone(v.payoutAccount)) {
      ctx.addIssue({ code: "custom", path: ["payoutAccount"], message: "Enter the Telebirr phone number" });
    }
  });
export type OrganiserInput = z.input<typeof organiserInput>;

/**
 * F2: apply to sell tickets. Businesses submit TIN and trade licence for admin review (AC1).
 * Individuals have no licence and can publish free events only (AC2), so they need no review.
 * Saving without `submit` keeps a draft. New organisers start with payout_hold (AC4).
 */
export async function saveOrganiserApplication(userId: string, raw: OrganiserInput, submit: boolean, now = new Date()) {
  const input = organiserInput.parse(raw);
  if (submit && input.type === "business" && (!input.tin || !input.licenceUrl)) {
    throw new DomainError("VALIDATION", "TIN and trade licence are needed");
  }
  const payoutAccount = input.payoutMethod === "telebirr" ? normalizeEthiopianPhone(input.payoutAccount)! : input.payoutAccount;
  const existing = await prisma.organiser.findFirst({ where: { ownerUserId: userId }, orderBy: { createdAt: "asc" } });
  if (existing && (existing.status === "submitted" || existing.status === "approved")) {
    throw new DomainError("ORGANISER_STATE", "Already submitted");
  }
  const data = {
    type: input.type,
    name: input.name,
    tin: input.tin ?? null,
    licenceUrl: input.licenceUrl ?? null,
    payoutMethod: input.payoutMethod,
    payoutAccount,
    status: submit ? ("submitted" as const) : ("draft" as const),
    submittedAt: submit ? now : null,
    rejectReason: null,
  };
  return prisma.$transaction(async (tx) => {
    const org = existing
      ? await tx.organiser.update({ where: { id: existing.id }, data })
      : await tx.organiser.create({ data: { ...data, ownerUserId: userId } });
    if (submit) {
      await audit({ actorUserId: userId, action: "organiser.submit", entity: "organiser", entityId: org.id, after: { type: org.type } }, tx);
    }
    await tx.userRole.upsert({
      where: { userId_role: { userId, role: "organiser" } },
      create: { userId, role: "organiser" },
      update: {},
    });
    return org;
  });
}

/** F2 stories: an admin approves or rejects an application, with a reason when rejecting. */
export async function reviewOrganiser(adminId: string, organiserId: string, approve: boolean, reason?: string, now = new Date()) {
  const org = await prisma.organiser.findUnique({ where: { id: organiserId } });
  if (!org) throw new DomainError("NOT_FOUND");
  if (org.status !== "submitted") throw new DomainError("ORGANISER_STATE");
  const rejectReason = approve ? null : reason?.trim().slice(0, 300) || "Details could not be verified";
  return prisma.$transaction(async (tx) => {
    const updated = await tx.organiser.update({
      where: { id: organiserId },
      data: { status: approve ? "approved" : "rejected", rejectReason, reviewedAt: now },
    });
    await audit(
      {
        actorUserId: adminId,
        action: approve ? "organiser.approve" : "organiser.reject",
        entity: "organiser",
        entityId: organiserId,
        before: { status: org.status },
        after: { status: updated.status, reason: rejectReason },
      },
      tx,
    );
    await notifyUser(tx, {
      recipientId: org.ownerUserId,
      actorId: adminId,
      type: approve ? "organiser_approved" : "organiser_rejected",
      href: "/organiser",
    });
    return updated;
  });
}

/** Paid tickets need an approved organiser (F2-AC1); individuals sell free tickets only (AC2). */
export function canSellPaid(org: Pick<Organiser, "status" | "type">) {
  return org.status === "approved" && org.type === "business";
}

export const teamInput = z.object({ phone: z.string().min(9).max(20), role: z.enum(["manager", "scanner"]) });

/**
 * F2-AC5: invite a team member by phone as manager or scanner. People who haven't used
 * ድንኳን yet get an account they claim by logging in with that number.
 */
export async function addTeamMember(actorId: string, organiserId: string, raw: z.input<typeof teamInput>) {
  const input = teamInput.parse(raw);
  const access = await assertCanManage(actorId, organiserId);
  // Managers can add scanners; only the owner (or an admin) can add another manager.
  if (input.role === "manager" && access === "manager") throw new DomainError("FORBIDDEN");
  const phone = normalizeEthiopianPhone(input.phone);
  if (!phone) throw new DomainError("INVALID_PHONE");
  const org = await prisma.organiser.findUniqueOrThrow({ where: { id: organiserId } });
  return prisma.$transaction(async (tx) => {
    const user =
      (await tx.user.findUnique({ where: { phone } })) ??
      (await tx.user.create({ data: { phone, roles: { create: { role: "buyer" } } } }));
    if (user.id === org.ownerUserId) throw new DomainError("VALIDATION", "That's the owner");
    const member = await tx.organiserMember.upsert({
      where: { organiserId_userId: { organiserId, userId: user.id } },
      create: { organiserId, userId: user.id, role: input.role },
      update: { role: input.role },
    });
    await audit({ actorUserId: actorId, action: "organiser.team_add", entity: "organiser", entityId: organiserId, after: { userId: user.id, role: input.role } }, tx);
    await notifyUser(tx, { recipientId: user.id, actorId, type: "team_added", href: "/organiser" });
    return member;
  });
}

export async function removeTeamMember(actorId: string, organiserId: string, userId: string) {
  const access = await assertCanManage(actorId, organiserId);
  const member = await prisma.organiserMember.findUnique({ where: { organiserId_userId: { organiserId, userId } } });
  if (!member) throw new DomainError("NOT_FOUND");
  if (member.role === "manager" && access === "manager" && userId !== actorId) throw new DomainError("FORBIDDEN");
  await prisma.$transaction(async (tx) => {
    await tx.organiserMember.delete({ where: { organiserId_userId: { organiserId, userId } } });
    await audit({ actorUserId: actorId, action: "organiser.team_remove", entity: "organiser", entityId: organiserId, before: { userId, role: member.role } }, tx);
  });
}

export function teamOf(organiserId: string) {
  return prisma.organiserMember.findMany({
    where: { organiserId },
    include: { user: { select: { id: true, name: true, phone: true, profile: { select: { username: true, displayName: true } } } } },
  });
}
