import { prisma } from "@dinkuan/db";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addTeamMember,
  attendees,
  attendeesCsv,
  auditLog,
  cancelEvent,
  createEvent,
  eventStats,
  fraudFlags,
  handlePaymentWebhook,
  organiserMoney,
  phoneConsentType,
  reviewEvent,
  reviewOrganiser,
  saveOrganiserApplication,
  saveTicketTypes,
  setFeatured,
  setFeeOverride,
  startCheckout,
  submitEvent,
  type EventInput,
} from "../src/server";
import { gatewayMarksPaid, makeUser, resetDb, webhookFor } from "./helpers";

beforeEach(resetDb);

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
const details = (over: Partial<EventInput> = {}): EventInput => ({
  titleEn: "Rooftop Sessions",
  titleAm: "የጣሪያ ምሽት",
  category: "nightlife",
  venue: { name: "Bole Rooftop", address: "Bole, Addis Ababa", lat: 8.99, lng: 38.79 },
  startsAt: inDays(10),
  ...over,
});
const tiers = [
  { name: "Early Bird", priceSantim: 30_000, capacity: 50 },
  { name: "Regular", priceSantim: 50_000, capacity: 200 },
  { name: "VIP", priceSantim: 150_000, capacity: 20 },
];

async function admin() {
  const u = await makeUser("Admin");
  await prisma.userRole.create({ data: { userId: u.id, role: "admin" } });
  return u;
}

async function approvedOrganiser() {
  const owner = await makeUser("Owner");
  const org = await saveOrganiserApplication(
    owner.id,
    { type: "business", name: "Addis Nights", tin: "0012345678", licenceUrl: "/api/media/licence", payoutMethod: "telebirr", payoutAccount: "0911223344" },
    true,
  );
  await reviewOrganiser((await admin()).id, org.id, true);
  return { owner, org };
}

async function pay(userId: string, eventId: string, ticketTypeId: string, qty = 1) {
  const { order } = await startCheckout({ userId, eventId, items: [{ ticketTypeId, qty }], gateway: "telebirr" });
  await gatewayMarksPaid(order.gatewayRef);
  const w = webhookFor(order.gatewayRef, order.totalSantim);
  await handlePaymentWebhook("telebirr", w.body, w.headers);
  return order;
}

describe("F2 organiser onboarding", () => {
  it("F2-AC1/AC3/AC4: business applications go draft → submitted → approved, with payout hold", async () => {
    const owner = await makeUser("Owner");
    const input = { type: "business" as const, name: "Addis Nights", tin: "0012345678", licenceUrl: "/api/media/l", payoutMethod: "telebirr" as const, payoutAccount: "0911223344" };
    const draft = await saveOrganiserApplication(owner.id, input, false);
    expect(draft).toMatchObject({ status: "draft", payoutAccount: "+251911223344", payoutHold: true });
    await expect(saveOrganiserApplication(owner.id, { ...input, licenceUrl: null }, true)).rejects.toMatchObject({ code: "VALIDATION" });
    const submitted = await saveOrganiserApplication(owner.id, input, true);
    expect(submitted.status).toBe("submitted");
    const mod = await admin();
    const approved = await reviewOrganiser(mod.id, submitted.id, true);
    expect(approved.status).toBe("approved");
    expect(await prisma.notification.count({ where: { recipientId: owner.id, type: "organiser_approved" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: submitted.id, action: "organiser.approve", actorUserId: mod.id } })).toBe(1);
  });

  it("F2 story: a rejection carries a reason and the applicant can fix and resubmit", async () => {
    const owner = await makeUser("Owner");
    const input = { type: "business" as const, name: "Addis Nights", tin: "0012345678", licenceUrl: "/api/media/l", payoutMethod: "bank" as const, payoutAccount: "CBE 1000123456789" };
    const org = await saveOrganiserApplication(owner.id, input, true);
    const rejected = await reviewOrganiser((await admin()).id, org.id, false, "Licence photo is blurry");
    expect(rejected).toMatchObject({ status: "rejected", rejectReason: "Licence photo is blurry" });
    expect((await saveOrganiserApplication(owner.id, input, true)).status).toBe("submitted");
  });

  it("F2-AC1/AC2: only approved businesses sell paid tickets; individuals publish free events", async () => {
    const person = await makeUser("Individual");
    const org = await saveOrganiserApplication(person.id, { type: "individual", name: "Hanna's Book Club", payoutMethod: "telebirr", payoutAccount: "0911000111" }, true);
    const event = await createEvent(person.id, org.id, details({ category: "community" }));
    await expect(saveTicketTypes(person.id, event.id, tiers)).rejects.toMatchObject({ code: "ORGANISER_NOT_APPROVED" });
    await saveTicketTypes(person.id, event.id, [{ name: "Free entry", priceSantim: 0, capacity: 40 }]);
    expect((await submitEvent(person.id, event.id)).status).toBe("pending_review");
  });

  it("F2-AC5 / rule 7: team members as manager or scanner; scanners can't manage events", async () => {
    const { owner, org } = await approvedOrganiser();
    const manager = await addTeamMember(owner.id, org.id, { phone: "0922000001", role: "manager" });
    const scanner = await addTeamMember(manager.userId, org.id, { phone: "0922000002", role: "scanner" });
    await expect(addTeamMember(manager.userId, org.id, { phone: "0922000003", role: "manager" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await createEvent(manager.userId, org.id, details());
    await expect(createEvent(scanner.userId, org.id, details())).rejects.toMatchObject({ code: "FORBIDDEN" });
    const stranger = await makeUser("Stranger");
    await expect(createEvent(stranger.id, org.id, details())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("F3 event creation", () => {
  it("F3-AC1: needs a title, venue and at least one ticket type before publishing", async () => {
    const { owner, org } = await approvedOrganiser();
    await expect(createEvent(owner.id, org.id, details({ titleEn: null, titleAm: null }))).rejects.toThrow();
    await expect(createEvent(owner.id, org.id, details({ venue: null }))).rejects.toThrow();
    const event = await createEvent(owner.id, org.id, details());
    expect(event).toMatchObject({ status: "draft", slug: "rooftop-sessions", posterUrl: "/posters/rooftop-sessions" });
    await expect(submitEvent(owner.id, event.id)).rejects.toMatchObject({ code: "EVENT_INCOMPLETE" });
  });

  it("F3-AC3/AC4/AC5: three tiers; the first 3 events go to review, then publish directly", async () => {
    const { owner, org } = await approvedOrganiser();
    const mod = await admin();
    for (let i = 0; i < 3; i++) {
      const e = await createEvent(owner.id, org.id, details({ titleEn: `Night ${i}` }));
      const types = await saveTicketTypes(owner.id, e.id, tiers);
      expect(types.map((t) => t.name)).toEqual(["Early Bird", "Regular", "VIP"]);
      expect((await submitEvent(owner.id, e.id)).status).toBe("pending_review");
      expect((await reviewEvent(mod.id, e.id, true)).status).toBe("published");
    }
    const fourth = await createEvent(owner.id, org.id, details({ titleEn: "Night 4" }));
    await saveTicketTypes(owner.id, fourth.id, tiers);
    expect((await submitEvent(owner.id, fourth.id)).status).toBe("published");
  });

  it("F3-AC5: an event sent back from review returns to draft with a note", async () => {
    const { owner, org } = await approvedOrganiser();
    const e = await createEvent(owner.id, org.id, details());
    await saveTicketTypes(owner.id, e.id, tiers);
    await submitEvent(owner.id, e.id);
    const back = await reviewEvent((await admin()).id, e.id, false, "Add the lineup");
    expect(back).toMatchObject({ status: "draft", reviewNote: "Add the lineup" });
    expect(await prisma.notification.count({ where: { recipientId: owner.id, type: "event_rejected" } })).toBe(1);
  });

  it("F3-AC3: hidden ticket types need an access code", async () => {
    const { owner, org } = await approvedOrganiser();
    const e = await createEvent(owner.id, org.id, details());
    await expect(saveTicketTypes(owner.id, e.id, [{ name: "Friends", priceSantim: 0, capacity: 10, visibility: "hidden" }])).rejects.toThrow();
    const [t] = await saveTicketTypes(owner.id, e.id, [{ name: "Friends", priceSantim: 0, capacity: 10, visibility: "hidden", accessCode: "SELAM" }]);
    expect(t).toMatchObject({ visibility: "hidden", accessCode: "SELAM", perOrderMax: 10 });
  });

  it("F3-AC6: a ticket type with sales can't change price or be removed", async () => {
    const { owner, org } = await approvedOrganiser();
    const e = await createEvent(owner.id, org.id, details());
    const [early, regular] = await saveTicketTypes(owner.id, e.id, tiers.slice(0, 2));
    await prisma.event.update({ where: { id: e.id }, data: { status: "published" } });
    await pay((await makeUser()).id, e.id, early!.id, 2);
    const edit = (over: object) => [{ id: early!.id, name: "Early Bird", priceSantim: 30_000, capacity: 50, ...over }, { id: regular!.id, name: "Regular", priceSantim: 50_000, capacity: 200 }];
    await expect(saveTicketTypes(owner.id, e.id, edit({ priceSantim: 35_000 }))).rejects.toMatchObject({ code: "PRICE_LOCKED" });
    await expect(saveTicketTypes(owner.id, e.id, edit({ capacity: 1 }))).rejects.toMatchObject({ code: "CAPACITY_BELOW_SOLD" });
    await expect(saveTicketTypes(owner.id, e.id, [{ id: regular!.id, name: "Regular", priceSantim: 50_000, capacity: 200 }])).rejects.toMatchObject({ code: "TYPE_HAS_SALES" });
    // Renaming and adding capacity are fine, and a new type can carry the new price.
    const saved = await saveTicketTypes(owner.id, e.id, [...edit({ name: "Early Bird ✨", capacity: 60 }), { name: "Late", priceSantim: 35_000, capacity: 50 }]);
    expect(saved.map((t) => [t.name, t.capacity])).toEqual([["Early Bird ✨", 60], ["Regular", 200], ["Late", 50]]);
  });

  it("F3-AC7: cancelling refunds every paid order in full, voids tickets and books the ledger", async () => {
    const { owner, org } = await approvedOrganiser();
    const e = await createEvent(owner.id, org.id, details());
    const [t] = await saveTicketTypes(owner.id, e.id, tiers);
    await prisma.event.update({ where: { id: e.id }, data: { status: "published" } });
    const a = await pay((await makeUser()).id, e.id, t!.id, 2);
    await pay((await makeUser()).id, e.id, t!.id, 1);
    const res = await cancelEvent(owner.id, e.id, "Venue flooded");
    expect(res).toEqual({ orders: 2, refunded: 2, failed: 0, remaining: 0 });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("refunded");
    expect(await prisma.ticket.count({ where: { eventId: e.id, status: "refunded" } })).toBe(3);
    expect(await prisma.refund.count({ where: { status: "done" } })).toBe(2);
    const money = await organiserMoney(owner.id, org.id);
    expect(money).toMatchObject({ salesSantim: 90_000, refundsSantim: 90_000, netSantim: 0 });
    // The platform's fee is refunded too, and never mixed into the organiser's balance (F11-AC3).
    const platform = await prisma.ledgerEntry.aggregate({ where: { organiserId: null }, _sum: { amountSantim: true } });
    expect(platform._sum.amountSantim).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "order.refund" } })).toBe(2);
  });
});

describe("F11 organiser dashboard", () => {
  it("F11-AC1/AC3: stats per event match the orders exactly", async () => {
    const { owner, org } = await approvedOrganiser();
    const e = await createEvent(owner.id, org.id, details());
    const [early, , vip] = await saveTicketTypes(owner.id, e.id, tiers);
    await prisma.event.update({ where: { id: e.id }, data: { status: "published" } });
    const buyer = await makeUser("Selam");
    await pay(buyer.id, e.id, early!.id, 2);
    await pay((await makeUser()).id, e.id, vip!.id, 1);
    await prisma.ticket.updateMany({ where: { eventId: e.id, ticketTypeId: vip!.id }, data: { status: "checked_in" } });
    const s = await eventStats(owner.id, e.id);
    expect(s).toMatchObject({ grossSantim: 210_000, refundsSantim: 0, netSantim: 210_000, orders: 2, ticketsIssued: 3, checkIns: 1 });
    // Fee: 5% + 10 Br per paid ticket, kept apart from organiser revenue.
    expect(s.feesSantim).toBe(2 * (1_500 + 1_000) + (7_500 + 1_000));
    expect(s.types.map((t) => [t.name, t.sold, t.revenueSantim])).toEqual([["Early Bird", 2, 60_000], ["Regular", 0, 0], ["VIP", 1, 150_000]]);
    await expect(eventStats(buyer.id, e.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("F11-AC2 / rule 12: attendee CSV shows phones only for buyers who agreed", async () => {
    const { owner, org } = await approvedOrganiser();
    const e = await createEvent(owner.id, org.id, details());
    const [t] = await saveTicketTypes(owner.id, e.id, tiers);
    await prisma.event.update({ where: { id: e.id }, data: { status: "published" } });
    const yes = await makeUser("Abebe");
    const no = await makeUser("=Bekele");
    await prisma.consent.create({ data: { userId: yes.id, type: phoneConsentType(e.id), granted: true } });
    await pay(yes.id, e.id, t!.id);
    await pay(no.id, e.id, t!.id);
    const rows = await attendees(owner.id, e.id);
    expect(rows.find((r) => r.name === "Abebe")?.phone).toBe(yes.phone);
    expect(rows.find((r) => r.name === "=Bekele")?.phone).toBeNull();
    const csv = attendeesCsv(rows);
    expect(csv).toContain(`"Abebe","Early Bird","no","${yes.phone}"`);
    expect(csv).toContain(`"'=Bekele","Early Bird","no",""`);
    // Withdrawing consent hides the number again.
    await prisma.consent.create({ data: { userId: yes.id, type: phoneConsentType(e.id), granted: false } });
    expect((await attendees(owner.id, e.id)).find((r) => r.name === "Abebe")?.phone).toBeNull();
  });
});

describe("F12 admin", () => {
  it("F12-AC2/AC4: featuring and fee overrides are audit-logged with before and after", async () => {
    const { owner, org } = await approvedOrganiser();
    const e = await createEvent(owner.id, org.id, details());
    const mod = await admin();
    await setFeatured(mod.id, e.id, true);
    await setFeeOverride(mod.id, e.id, { feePctBps: 300, feeFixedSantim: 500 });
    const log = await auditLog({ entityId: e.id });
    expect(log.map((l) => l.action).slice(0, 2)).toEqual(["event.fee_override", "event.feature"]);
    expect(log[0]).toMatchObject({ actorUserId: mod.id, before: { feePctBps: 500, feeFixedSantim: 1000 }, after: { feePctBps: 300, feeFixedSantim: 500 } });
  });

  it("F12-AC3: flags more than 20 tickets per phone per event and bursts of failed payments", async () => {
    const { owner, org } = await approvedOrganiser();
    const e = await createEvent(owner.id, org.id, details());
    const [t] = await saveTicketTypes(owner.id, e.id, [{ name: "Regular", priceSantim: 10_000, capacity: 500, perOrderMax: 20 }]);
    await prisma.event.update({ where: { id: e.id }, data: { status: "published" } });
    const bulk = await makeUser("Bulk");
    // Seeded directly: checkout itself caps a phone at 10 per event (F5-AC9), so this is the
    // kind of pattern a flag should catch if tickets arrive some other way.
    for (let i = 0; i < 3; i++) {
      await prisma.order.create({
        data: { userId: bulk.id, eventId: e.id, status: "paid", subtotalSantim: 0, feeSantim: 0, totalSantim: 0, gateway: "telebirr", gatewayRef: `bulk-${i}`, expiresAt: new Date(), items: { create: { ticketTypeId: t!.id, qty: 8, unitPriceSantim: 10_000 } } },
      });
    }
    const failer = await makeUser("Failer");
    for (let i = 0; i < 5; i++) {
      await prisma.order.create({ data: { userId: failer.id, eventId: e.id, status: "failed", subtotalSantim: 0, feeSantim: 0, totalSantim: 0, gateway: "telebirr", gatewayRef: `fail-${i}`, expiresAt: new Date() } });
    }
    const flags = await fraudFlags();
    expect(flags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "tickets_per_phone", userId: bulk.id, count: 24 }),
        expect.objectContaining({ kind: "failed_payments", userId: failer.id, count: 5 }),
      ]),
    );
  });
});
