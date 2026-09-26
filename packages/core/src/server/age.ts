import { prisma, type Prisma } from "@dinkuan/db";
import { ageGroup, validBirthDate, type AgeGroup } from "../age";
import { DomainError } from "../errors";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * F22-AC8: records a member's birth date, once (a change goes through support, so a teen can't
 * simply type a new year). Under 13 can't use ድንኳን: nothing is stored and the member is signed
 * out. Teens start with a private account.
 */
export async function setBirthDate(userId: string, value: string, now = new Date()): Promise<AgeGroup> {
  if (!validBirthDate(value, now)) throw new DomainError("VALIDATION", "Enter a real birth date");
  const group = ageGroup(value, now);
  if (group === "child") {
    await prisma.session.deleteMany({ where: { userId } });
    throw new DomainError("UNDERAGE");
  }
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.user.updateMany({ where: { id: userId, birthDate: null }, data: { birthDate: new Date(`${value}T00:00:00Z`) } });
    if (count === 0) throw new DomainError("VALIDATION", "Your birth date is already set");
    if (group === "teen") await tx.profile.updateMany({ where: { userId }, data: { isPrivate: true } });
  });
  return group;
}

export async function userAgeGroup(db: Db, userId: string, now = new Date()): Promise<AgeGroup> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { birthDate: true } });
  return ageGroup(u?.birthDate, now);
}

/** F22-AC8: nightlife tickets (and gifting, in Phase 2) are for adults. No birth date yet means ask for one. */
export async function assertAdult(db: Db, userId: string, now = new Date()) {
  const group = await userAgeGroup(db, userId, now);
  if (group === "unknown") throw new DomainError("BIRTH_DATE_REQUIRED");
  if (group !== "adult") throw new DomainError("AGE_RESTRICTED");
}
