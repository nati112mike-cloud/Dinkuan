import { prisma } from "@dinkuan/db";
import { block } from "@dinkuan/social";
import { beforeEach, describe, expect, it } from "vitest";
import {
  compareVendors,
  myShortlist,
  savePackages,
  searchVendors,
  setBlockedDates,
  shortlistByToken,
  toggleShortlist,
} from "../src";
import { inDays, member, resetDb, vendor } from "./helpers";

beforeEach(resetDb);

async function setStats(userId: string, data: { ratingAvg?: number; ratingCount?: number; bookingsCount?: number; level?: "new" | "rising" | "top_rated" | "pro"; qualityScore?: number }) {
  await prisma.vendorProfile.update({ where: { userId }, data });
}

async function world() {
  const kaleb = await vendor("Kaleb", { genres: ["Afro-house"], areas: ["Bole"], languages: ["Amharic", "English"] }, 20_000);
  const selam = await vendor("Selam", { genres: ["Ethio-electronic"], areas: ["Kirkos"], languages: ["Amharic"] }, 12_000);
  const nahom = await vendor("Nahom", { genres: ["Deep house", "Afro-house"], areas: ["Bole"], languages: ["English"] }, 30_000);
  const hiwot = await vendor("Hiwot", { types: ["photographer"], genres: ["Weddings"], areas: ["Yeka"] }, 15_000);
  await setStats(kaleb.id, { ratingAvg: 490, ratingCount: 40, bookingsCount: 60, level: "pro", qualityScore: 90 });
  await setStats(selam.id, { ratingAvg: 460, ratingCount: 12, bookingsCount: 90, level: "rising", qualityScore: 70 });
  await setStats(nahom.id, { ratingAvg: 480, ratingCount: 8, bookingsCount: 10, level: "rising", qualityScore: 80 });
  return { kaleb, selam, nahom, hiwot };
}

const ids = (r: { items: { userId: string }[] }) => r.items.map((v) => v.userId);

describe("F20 search & compare", () => {
  it("F20-AC9: browse by type, then filter by date, price, rating, genre, area, level and language", async () => {
    const { kaleb, selam, nahom } = await world();
    expect(ids(await searchVendors({ type: "dj" }, null)).sort()).toEqual([kaleb.id, selam.id, nahom.id].sort());
    const date = inDays(20);
    await setBlockedDates(selam.id, { block: [date] });
    expect(ids(await searchVendors({ type: "dj", date }, null))).not.toContain(selam.id);
    expect(ids(await searchVendors({ type: "dj", minPriceSantim: 1_500_000, maxPriceSantim: 2_500_000 }, null))).toEqual([kaleb.id]);
    expect(ids(await searchVendors({ type: "dj", minRating: 4.7 }, null)).sort()).toEqual([kaleb.id, nahom.id].sort());
    expect(ids(await searchVendors({ type: "dj", genre: "Afro-house", sort: "price_asc" }, null))).toEqual([kaleb.id, nahom.id]);
    expect(ids(await searchVendors({ type: "dj", area: "Kirkos" }, null))).toEqual([selam.id]);
    expect(ids(await searchVendors({ type: "dj", level: "pro" }, null))).toEqual([kaleb.id]);
    expect(ids(await searchVendors({ type: "dj", language: "English", sort: "price_asc" }, null))).toEqual([kaleb.id, nahom.id]);
    await expect(searchVendors({ minPriceSantim: 10, maxPriceSantim: 5 }, null)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("F20-AC10: sort by recommended, top rated, price low–high and most booked", async () => {
    const { kaleb, selam, nahom } = await world();
    expect(ids(await searchVendors({ type: "dj" }, null))).toEqual([kaleb.id, nahom.id, selam.id]);
    expect(ids(await searchVendors({ type: "dj", sort: "top_rated" }, null))).toEqual([kaleb.id, nahom.id, selam.id]);
    expect(ids(await searchVendors({ type: "dj", sort: "price_asc" }, null))).toEqual([selam.id, kaleb.id, nahom.id]);
    expect(ids(await searchVendors({ type: "dj", sort: "most_booked" }, null))).toEqual([selam.id, kaleb.id, nahom.id]);
  });

  it("F20-AC10/F21-AC3: promoted vendors are pinned first on page one, only when they match the filters", async () => {
    const { kaleb, selam, hiwot } = await world();
    const r = await searchVendors({ type: "dj" }, null, [selam.id, hiwot.id]);
    expect(r.promoted.map((v) => v.userId)).toEqual([selam.id]);
    expect(ids(r)).not.toContain(selam.id);
    expect(ids(r)[0]).toBe(kaleb.id);
    expect((await searchVendors({ type: "dj", page: 1 }, null, [selam.id])).promoted).toEqual([]);
  });

  it("F20-AC11: cards carry name, level, rating, starting price, genres and the date they are free on", async () => {
    const { kaleb } = await world();
    const date = inDays(30);
    const r = await searchVendors({ type: "dj", date, level: "pro" }, null);
    expect(r.availableOn).toBe(date);
    expect(r.items[0]).toMatchObject({
      userId: kaleb.id,
      level: "pro",
      ratingAvg: 490,
      ratingCount: 40,
      startingPriceSantim: 2_000_000,
      genres: ["Afro-house"],
      user: { profile: { displayName: "Kaleb" } },
    });
  });

  it("CLAUDE.md rule 15: a vendor who blocked you (or you blocked) is left out of search and compare", async () => {
    const { kaleb, selam } = await world();
    const client = await member("Client");
    await block(kaleb.id, client.id);
    expect(ids(await searchVendors({ type: "dj" }, client.id))).not.toContain(kaleb.id);
    expect((await compareVendors([kaleb.id, selam.id], client.id)).map((v) => v.userId)).toEqual([selam.id]);
  });

  it("F20-AC12: compare up to three vendors side by side", async () => {
    const { kaleb, selam, nahom, hiwot } = await world();
    await savePackages(kaleb.id, [
      { tier: "basic", name: "Club", priceSantim: 2_000_000, hours: 4, includes: ["DJ"] },
      { tier: "premium", name: "Wedding", priceSantim: 5_000_000, hours: 8, includes: ["DJ", "MC"] },
    ]);
    const rows = await compareVendors([nahom.id, kaleb.id, selam.id], null);
    expect(rows.map((r) => r.userId)).toEqual([nahom.id, kaleb.id, selam.id]);
    expect(rows[1]!.packages.map((p) => p.tier)).toEqual(["basic", "premium"]);
    expect(rows[1]).toMatchObject({ ratingAvg: 490, yearsExperience: 0, _count: { albums: 0 } });
    await expect(compareVendors([kaleb.id, selam.id, nahom.id, hiwot.id], null)).rejects.toMatchObject({ code: "COMPARE_LIMIT" });
  });

  it("F20-AC13: save vendors to a shortlist and share it by link", async () => {
    const { kaleb, selam } = await world();
    const bride = await member("Bride");
    expect(await toggleShortlist(bride.id, kaleb.id)).toBe(true);
    expect(await toggleShortlist(bride.id, selam.id)).toBe(true);
    expect(await toggleShortlist(bride.id, selam.id)).toBe(false);
    const list = await myShortlist(bride.id);
    expect(list.items.map((i) => i.vendorId)).toEqual([kaleb.id]);
    // Family open the shared link without an account.
    const shared = await shortlistByToken(list.shareToken, null);
    expect(shared?.items.map((i) => i.vendorId)).toEqual([kaleb.id]);
    expect(shared?.user.profile?.displayName).toBe("Bride");
    expect(await shortlistByToken("nope", null)).toBeNull();
  });
});
