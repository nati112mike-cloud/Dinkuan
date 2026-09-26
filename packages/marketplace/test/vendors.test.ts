import { prisma } from "@dinkuan/db";
import { createPost, followingFeed, follow } from "@dinkuan/social";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addCredit,
  blockForBooking,
  confirmGig,
  createAlbum,
  getVendorPage,
  isAvailable,
  listPackages,
  pendingGigs,
  savePackages,
  saveVendorProfile,
  setBlockedDates,
  unavailableDates,
} from "../src";
import { inDays, makeEvent, member, resetDb, uploaded, vendor } from "./helpers";

beforeEach(resetDb);

describe("F20 pro profiles", () => {
  it("F22-AC8: pro profiles are for adults, so teens get no messages from clients they don't know", async () => {
    const teen = await member("Teen");
    await prisma.user.update({ where: { id: teen.id }, data: { birthDate: new Date(`${new Date().getUTCFullYear() - 16}-01-01T00:00:00Z`) } });
    await expect(saveVendorProfile(teen.id, { types: ["dj"], headline: "Teen DJ" })).rejects.toMatchObject({ code: "AGE_RESTRICTED" });
    const legacy = await member("Legacy");
    await prisma.user.update({ where: { id: legacy.id }, data: { birthDate: null } });
    await expect(saveVendorProfile(legacy.id, { types: ["dj"], headline: "Wedding DJ" })).rejects.toMatchObject({ code: "BIRTH_DATE_REQUIRED" });
    expect(await prisma.vendorProfile.count()).toBe(0);
  });

  it("F20-AC1: a member becomes a vendor with a pro profile on top of their social profile", async () => {
    const u = await member("Kaleb", { username: "djkaleb" });
    await saveVendorProfile(u.id, {
      types: ["dj", "mc"],
      headline: "Afro-house & wedding DJ · 8 years",
      yearsExperience: 8,
      services: ["Weddings", "Clubs"],
      genres: ["Afro-house", "Amapiano"],
      languages: ["Amharic", "English"],
      areas: ["Bole"],
      equipment: ["Pioneer XDJ-XZ", "2 × QSC K12"],
      teamSize: 2,
      socialLinks: ["https://example.com/kaleb"],
    });
    const page = await getVendorPage("djkaleb", null);
    expect(page?.vendor).toMatchObject({ types: ["dj", "mc"], yearsExperience: 8, teamSize: 2, level: "new" });
    expect(page?.profile.username).toBe("djkaleb");
    await expect(saveVendorProfile(u.id, { types: [], headline: "x" })).rejects.toBeDefined();
    expect(await getVendorPage("nobody", null)).toBeNull();
  });

  it("F20-AC4: up to three tiers with add-ons, and 'Starting from' is the cheapest", async () => {
    const v = await vendor("Selam", {}, 15_000);
    await savePackages(v.id, [
      { tier: "basic", name: "Club set", priceSantim: 1_200_000, hours: 4, includes: ["DJ", "Sound"] },
      { tier: "standard", name: "Wedding", priceSantim: 2_500_000, hours: 6, includes: ["DJ", "Sound", "Lights"], addons: [{ name: "Extra hour", priceSantim: 300_000 }] },
      { tier: "premium", name: "Full day", priceSantim: 4_000_000, hours: 10, includes: ["DJ", "MC", "Sound"], addons: [{ name: "Drone", priceSantim: 800_000 }] },
    ]);
    const pkgs = await listPackages(v.id);
    expect(pkgs.map((p) => p.tier)).toEqual(["basic", "standard", "premium"]);
    expect(pkgs[1]!.addons).toMatchObject([{ name: "Extra hour", priceSantim: 300_000 }]);
    expect((await prisma.vendorProfile.findUniqueOrThrow({ where: { userId: v.id } })).startingPriceSantim).toBe(1_200_000);
    await expect(
      savePackages(v.id, [
        { tier: "basic", name: "Alpha", priceSantim: 100_00, hours: 1, includes: ["x"] },
        { tier: "basic", name: "Beta", priceSantim: 100_00, hours: 1, includes: ["x"] },
      ]),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    // Dropping a tier switches it off and the starting price follows.
    await savePackages(v.id, [{ tier: "premium", name: "Full day", priceSantim: 4_000_000, hours: 10, includes: ["DJ"] }]);
    expect((await listPackages(v.id)).map((p) => p.tier)).toEqual(["premium"]);
    expect((await prisma.vendorProfile.findUniqueOrThrow({ where: { userId: v.id } })).startingPriceSantim).toBe(4_000_000);
    const stranger = await member("Stranger");
    await expect(savePackages(stranger.id, [])).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("F20-AC5: the vendor blocks dates, and booked dates block automatically", async () => {
    const v = await vendor("Nahom");
    const [d1, d2, d3] = [inDays(10), inDays(11), inDays(12)];
    await setBlockedDates(v.id, { block: [d1, d2] });
    expect(await isAvailable(v.id, d1)).toBe(false);
    expect(await isAvailable(v.id, d3)).toBe(true);
    await prisma.$transaction((tx) => blockForBooking(tx, v.id, d3, "00000000-0000-4000-8000-000000000001"));
    expect(await unavailableDates(v.id, d1, d3)).toEqual([
      { date: d1, reason: "blocked" },
      { date: d2, reason: "blocked" },
      { date: d3, reason: "booked" },
    ]);
    // The vendor can free a blocked date but not a booked one.
    await setBlockedDates(v.id, { unblock: [d2, d3] });
    expect(await isAvailable(v.id, d2)).toBe(true);
    expect(await isAvailable(v.id, d3)).toBe(false);
    await expect(prisma.$transaction((tx) => blockForBooking(tx, v.id, d3, "00000000-0000-4000-8000-000000000002"))).rejects.toMatchObject({ code: "DATE_UNAVAILABLE" });
    await expect(setBlockedDates(v.id, { block: ["2026-02-30"] })).rejects.toBeDefined();
  });

  it("F20-AC2/AC3: tagging an event asks its organiser; confirmed work shows as a verified gig and stage", async () => {
    const organiser = await member("Organiser");
    const event = await makeEvent(organiser.id);
    const v = await vendor("Hiwot", { types: ["photographer"] });
    const blob = await uploaded(v.id);
    const album = await createAlbum(v.id, { title: "Hilton wedding, Jan 2026", eventId: event.id, items: [{ blobId: blob, width: 1200, height: 800 }] });
    expect(album.gigStatus).toBe("pending");
    expect(await prisma.notification.count({ where: { recipientId: organiser.id, type: "gig_tag" } })).toBe(1);

    expect((await pendingGigs(organiser.id)).map((a) => a.id)).toEqual([album.id]);
    const other = await member("Other");
    expect(await pendingGigs(other.id)).toEqual([]);
    await expect(confirmGig(other.id, album.id, true)).rejects.toMatchObject({ code: "FORBIDDEN" });

    await confirmGig(organiser.id, album.id, true);
    const page = await getVendorPage((await prisma.profile.findUniqueOrThrow({ where: { userId: v.id } })).username, null);
    expect(page?.verifiedGigs).toBe(1);
    expect(page?.vendor.albums[0]).toMatchObject({ gigStatus: "verified", title: "Hilton wedding, Jan 2026" });
    expect(page?.vendor.credits).toMatchObject([{ verified: true, eventId: event.id }]);

    // Self-added stage credits are listed but not verified.
    await addCredit(v.id, { name: "Sheraton Addis" });
    const credits = await prisma.stageCredit.findMany({ where: { vendorId: v.id }, orderBy: { verified: "desc" } });
    expect(credits.map((c) => c.verified)).toEqual([true, false]);
  });

  it("F20-AC2: albums only use the vendor's own finished uploads and pass screening", async () => {
    const v = await vendor("Abel");
    const thief = await member("Thief");
    const blob = await uploaded(thief.id);
    await expect(createAlbum(v.id, { title: "Mine", items: [{ blobId: blob, width: 10, height: 10 }] })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const own = await uploaded(v.id);
    await expect(createAlbum(v.id, { title: "free money at bit.ly/x", items: [{ blobId: own, width: 10, height: 10 }] })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("F20-AC8: a vendor's posts appear in the social feed like anyone's", async () => {
    const v = await vendor("Tsion");
    const fan = await member("Fan");
    await follow(fan.id, v.id);
    const post = await createPost(v.id, { type: "text", caption: "Saturday wedding set was magic 💍" });
    const feed = await followingFeed(fan.id);
    expect(feed.items.map((p) => p.id)).toContain(post.id);
  });
});
