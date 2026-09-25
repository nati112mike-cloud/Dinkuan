import { DomainError } from "@dinkuan/core";
import { prisma, type Prisma } from "@dinkuan/db";
import { z } from "zod";
import { assertVendor } from "./vendors";

/** Calendar dates travel as "YYYY-MM-DD" and are stored as Postgres `date` (no time zone). */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export function toDate(iso: string): Date {
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) throw new DomainError("VALIDATION", "Invalid date");
  return d;
}

export function fromDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today's calendar date in Addis Ababa (UTC+3, no daylight saving). */
export function addisToday(now = new Date()): string {
  return new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}

/** F20-AC5: the vendor blocks or frees dates. Booked dates can only be freed by the booking. */
export async function setBlockedDates(vendorId: string, raw: { block?: string[]; unblock?: string[] }) {
  await assertVendor(vendorId);
  const input = z.object({ block: z.array(isoDate).max(62).default([]), unblock: z.array(isoDate).max(62).default([]) }).parse(raw);
  await prisma.$transaction(async (tx) => {
    for (const iso of input.block) {
      await tx.availabilityBlock.upsert({
        where: { vendorId_date: { vendorId, date: toDate(iso) } },
        create: { vendorId, date: toDate(iso), reason: "blocked" },
        update: {},
      });
    }
    if (input.unblock.length) {
      await tx.availabilityBlock.deleteMany({
        where: { vendorId, reason: "blocked", date: { in: input.unblock.map(toDate) } },
      });
    }
  });
}

/** F20-AC5: booked dates block automatically (used when a booking is confirmed). */
export async function blockForBooking(tx: Prisma.TransactionClient, vendorId: string, iso: string, bookingId: string) {
  const date = toDate(iso);
  const existing = await tx.availabilityBlock.findUnique({ where: { vendorId_date: { vendorId, date } } });
  if (existing?.reason === "booked") throw new DomainError("DATE_UNAVAILABLE");
  await tx.availabilityBlock.upsert({
    where: { vendorId_date: { vendorId, date } },
    create: { vendorId, date, reason: "booked", bookingId },
    update: { reason: "booked", bookingId },
  });
}

/** Blocked and booked dates between two calendar dates, inclusive. */
export async function unavailableDates(vendorId: string, fromIso: string, toIso: string) {
  const rows = await prisma.availabilityBlock.findMany({
    where: { vendorId, date: { gte: toDate(fromIso), lte: toDate(toIso) } },
    orderBy: { date: "asc" },
  });
  return rows.map((r) => ({ date: fromDate(r.date), reason: r.reason }));
}

export async function isAvailable(vendorId: string, iso: string) {
  const n = await prisma.availabilityBlock.count({ where: { vendorId, date: toDate(iso) } });
  return n === 0;
}
