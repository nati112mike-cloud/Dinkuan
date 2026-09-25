import { DomainError } from "@dinkuan/core";
import { prisma } from "@dinkuan/db";
import { assertComplete, IMAGE_TYPES, mediaUrl, notify, screenText, VIDEO_TYPES } from "@dinkuan/social";
import { z } from "zod";
import { isoDate, toDate } from "./availability";
import { assertVendor, refreshVendorStats } from "./vendors";

const itemInput = z.object({
  blobId: z.uuid(),
  thumbBlobId: z.uuid().optional(),
  width: z.number().int().positive().max(10_000),
  height: z.number().int().positive().max(10_000),
  caption: z.string().trim().max(200).optional(),
});

export const albumInput = z.object({
  title: z.string().trim().min(2).max(80),
  eventId: z.uuid().nullable().optional(),
  items: z.array(itemInput).min(1).max(30),
});
export type AlbumInput = z.input<typeof albumInput>;

/** People who can confirm work done at an event: the organiser's owner and managers. */
async function eventManagers(eventId: string): Promise<string[]> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { organiser: { include: { members: { where: { role: "manager" } } } } },
  });
  if (!event) return [];
  return [event.organiser.ownerUserId, ...event.organiser.members.map((m) => m.userId)];
}

/**
 * F20-AC2: a portfolio album grouped by project. Tagging a ድንኳን event asks its organiser to
 * confirm; once confirmed the album shows as a "Verified gig". Text is screened like any post
 * (CLAUDE.md rule 14); uploads must be the vendor's own finished uploads.
 */
export async function createAlbum(vendorId: string, raw: AlbumInput) {
  await assertVendor(vendorId);
  const input = albumInput.parse(raw);
  const texts = [input.title, ...input.items.map((i) => i.caption ?? "")].join("\n");
  if (screenText(texts).status !== "public") throw new DomainError("VALIDATION", "This text can't be posted");
  const blobs = await Promise.all(input.items.map((i) => assertComplete(vendorId, i.blobId)));
  for (const i of input.items) if (i.thumbBlobId) await assertComplete(vendorId, i.thumbBlobId);
  if (blobs.some((b) => !IMAGE_TYPES.includes(b.contentType) && !VIDEO_TYPES.includes(b.contentType))) {
    throw new DomainError("UPLOAD_TYPE");
  }
  if (input.eventId && !(await prisma.event.findUnique({ where: { id: input.eventId } }))) throw new DomainError("NOT_FOUND");

  const album = await prisma.$transaction(async (tx) => {
    const a = await tx.portfolioAlbum.create({
      data: {
        vendorId,
        title: input.title,
        eventId: input.eventId ?? null,
        gigStatus: input.eventId ? "pending" : "none",
        coverUrl: mediaUrl(input.items[0]!.thumbBlobId ?? input.items[0]!.blobId),
        items: {
          create: input.items.map((i, idx) => ({
            kind: VIDEO_TYPES.includes(blobs[idx]!.contentType) ? "video" : "image",
            url: mediaUrl(i.blobId),
            thumbUrl: i.thumbBlobId ? mediaUrl(i.thumbBlobId) : null,
            width: i.width,
            height: i.height,
            caption: i.caption ?? null,
            orderIdx: idx,
          })),
        },
      },
    });
    if (input.eventId) {
      for (const managerId of await eventManagers(input.eventId)) {
        await notify(tx, { recipientId: managerId, actorId: vendorId, type: "gig_tag", href: "/vendor/gigs" });
      }
    }
    return a;
  });
  return album;
}

export async function deleteAlbum(vendorId: string, albumId: string) {
  const album = await prisma.portfolioAlbum.findUnique({ where: { id: albumId } });
  if (!album) throw new DomainError("NOT_FOUND");
  if (album.vendorId !== vendorId) throw new DomainError("FORBIDDEN");
  await prisma.$transaction(async (tx) => {
    await tx.portfolioAlbum.delete({ where: { id: albumId } });
    await refreshVendorStats(tx, vendorId);
  });
}

/** Albums tagged to events this person manages that are waiting for confirmation. */
export async function pendingGigs(userId: string) {
  return prisma.portfolioAlbum.findMany({
    where: {
      gigStatus: "pending",
      event: {
        organiser: { OR: [{ ownerUserId: userId }, { members: { some: { userId, role: "manager" } } }] },
      },
    },
    include: {
      event: { select: { id: true, slug: true, titleEn: true, titleAm: true, startsAt: true } },
      vendor: { include: { user: { select: { profile: true } } } },
      items: { take: 4, orderBy: { orderIdx: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * F20-AC2/AC3: the event's organiser confirms (or declines) that the vendor worked there.
 * A confirmed gig also becomes a verified stage credit.
 */
export async function confirmGig(userId: string, albumId: string, approve: boolean) {
  const album = await prisma.portfolioAlbum.findUnique({
    where: { id: albumId },
    include: { event: { include: { venue: true } } },
  });
  if (!album || !album.event) throw new DomainError("NOT_FOUND");
  if (!(await eventManagers(album.event.id)).includes(userId)) throw new DomainError("FORBIDDEN");
  if (album.gigStatus !== "pending") return album;
  const event = album.event;
  return prisma.$transaction(async (tx) => {
    const updated = await tx.portfolioAlbum.update({
      where: { id: albumId },
      data: { gigStatus: approve ? "verified" : "declined" },
    });
    if (approve) {
      const existing = await tx.stageCredit.findFirst({ where: { vendorId: album.vendorId, eventId: event.id } });
      const name = `${event.titleEn ?? event.titleAm ?? "Event"} · ${event.venue.name}`;
      if (existing) await tx.stageCredit.update({ where: { id: existing.id }, data: { verified: true } });
      else {
        await tx.stageCredit.create({
          data: { vendorId: album.vendorId, eventId: event.id, name, date: event.startsAt, verified: true },
        });
      }
      await notify(tx, { recipientId: album.vendorId, actorId: userId, type: "gig_verified", href: "/vendor/portfolio" });
      await refreshVendorStats(tx, album.vendorId);
    }
    return updated;
  });
}

export const creditInput = z.object({ name: z.string().trim().min(2).max(100), date: isoDate.optional() });

/** F20-AC3: venues and events the vendor has worked. Self-added credits are not verified. */
export async function addCredit(vendorId: string, raw: z.input<typeof creditInput>) {
  await assertVendor(vendorId);
  const input = creditInput.parse(raw);
  if (screenText(input.name).status !== "public") throw new DomainError("VALIDATION", "This text can't be posted");
  return prisma.stageCredit.create({
    data: { vendorId, name: input.name, date: input.date ? toDate(input.date) : null, verified: false },
  });
}

export async function removeCredit(vendorId: string, creditId: string) {
  const c = await prisma.stageCredit.findUnique({ where: { id: creditId } });
  if (!c) throw new DomainError("NOT_FOUND");
  if (c.vendorId !== vendorId) throw new DomainError("FORBIDDEN");
  await prisma.stageCredit.delete({ where: { id: creditId } });
}
