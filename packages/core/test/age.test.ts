import { prisma } from "@dinkuan/db";
import { beforeEach, describe, expect, it } from "vitest";
import { ageGroup, ageOn, validBirthDate } from "../src";
import { createSession, setBirthDate, startCheckout, userForSession } from "../src/server";
import { makeEvent, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);

const NOW = new Date("2026-09-26T09:00:00Z");
/** A `YYYY-MM-DD` birth date that makes someone `years` old on NOW. */
const bornYearsAgo = (years: number) => `${2026 - years}-03-01`;

describe("F22-AC8 age helpers", () => {
  it("F22-AC8: age counts whole years on the Addis Ababa calendar date", () => {
    expect(ageOn("2008-09-26", NOW)).toBe(18);
    expect(ageOn("2008-09-27", NOW)).toBe(17);
    // 22:30 UTC on the 26th is already the 27th in Addis Ababa, so the birthday has arrived.
    expect(ageOn("2008-09-27", new Date("2026-09-26T22:30:00Z"))).toBe(18);
    expect(ageOn(new Date("2008-09-27T00:00:00Z"), new Date("2026-09-26T20:00:00Z"))).toBe(17);
  });

  it("F22-AC8: groups are adult (18+), teen (13-17), child (under 13) and unknown (no date)", () => {
    expect(ageGroup(bornYearsAgo(18), NOW)).toBe("adult");
    expect(ageGroup(bornYearsAgo(17), NOW)).toBe("teen");
    expect(ageGroup(bornYearsAgo(13), NOW)).toBe("teen");
    expect(ageGroup(bornYearsAgo(12), NOW)).toBe("child");
    expect(ageGroup(null, NOW)).toBe("unknown");
  });

  it("F22-AC8: only real, past birth dates are accepted", () => {
    expect(validBirthDate("2000-02-29", NOW)).toBe(true);
    expect(validBirthDate("2001-02-29", NOW)).toBe(false);
    expect(validBirthDate("2027-01-01", NOW)).toBe(false);
    expect(validBirthDate("1850-01-01", NOW)).toBe(false);
    expect(validBirthDate("01/02/2000", NOW)).toBe(false);
  });
});

describe("F22-AC8 sign-up age rules", () => {
  it("F22-AC8: under 13 can't join; nothing is stored and the member is signed out", async () => {
    const u = await makeUser("Kid", null);
    const token = await createSession(u.id);
    await expect(setBirthDate(u.id, bornYearsAgo(12), NOW)).rejects.toMatchObject({ code: "UNDERAGE" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).birthDate).toBeNull();
    expect(await userForSession(token)).toBeNull();
  });

  it("F22-AC8: a teen account is private by default", async () => {
    const u = await makeUser("Teen", null);
    await prisma.profile.create({ data: { userId: u.id, username: "teen", displayName: "Teen", referralCode: "TEEN0001" } });
    expect(await setBirthDate(u.id, bornYearsAgo(15), NOW)).toBe("teen");
    expect((await prisma.profile.findUniqueOrThrow({ where: { userId: u.id } })).isPrivate).toBe(true);
  });

  it("F22-AC8: the birth date is set once, so a teen can't just type a new year", async () => {
    const u = await makeUser("Teen", null);
    await setBirthDate(u.id, bornYearsAgo(15), NOW);
    await expect(setBirthDate(u.id, bornYearsAgo(25), NOW)).rejects.toMatchObject({ code: "VALIDATION" });
    expect(ageGroup((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).birthDate, NOW)).toBe("teen");
  });
});

describe("F22-AC8 nightlife tickets are 18+", () => {
  const buy = (userId: string, eventId: string, ticketTypeId: string) =>
    startCheckout({ userId, eventId, items: [{ ticketTypeId, qty: 1 }], gateway: "telebirr" });

  it("F22-AC8: a teen can't buy a nightlife ticket and nothing is reserved", async () => {
    const { event, ticketType } = await makeEvent();
    const teen = await makeUser("Teen", new Date(`${bornYearsAgo(16)}T00:00:00Z`));
    await expect(buy(teen.id, event.id, ticketType.id)).rejects.toMatchObject({ code: "AGE_RESTRICTED" });
    expect((await prisma.ticketType.findUniqueOrThrow({ where: { id: ticketType.id } })).reserved).toBe(0);
    expect(await prisma.order.count()).toBe(0);
  });

  it("F22-AC8: a member with no birth date is asked for one before buying a nightlife ticket", async () => {
    const { event, ticketType } = await makeEvent();
    const legacy = await makeUser("Legacy", null);
    await expect(buy(legacy.id, event.id, ticketType.id)).rejects.toMatchObject({ code: "BIRTH_DATE_REQUIRED" });
    await setBirthDate(legacy.id, "1990-01-01");
    const { order } = await buy(legacy.id, event.id, ticketType.id);
    expect(order.status).toBe("pending");
  });

  it("F22-AC8: teens can still buy tickets for events that aren't nightlife", async () => {
    const { event, ticketType } = await makeEvent();
    await prisma.event.update({ where: { id: event.id }, data: { category: "comedy" } });
    const teen = await makeUser("Teen", new Date(`${bornYearsAgo(16)}T00:00:00Z`));
    const { order } = await buy(teen.id, event.id, ticketType.id);
    expect(order.status).toBe("pending");
  });
});
