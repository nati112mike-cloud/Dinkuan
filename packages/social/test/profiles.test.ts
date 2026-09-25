import { prisma } from "@dinkuan/db";
import { beforeEach, describe, expect, it } from "vitest";
import {
  approveFollowRequest,
  ensureProfile,
  follow,
  followRequests,
  searchPeople,
  setInterests,
  suggestPeople,
  unfollow,
  updateProfile,
} from "../src";
import { giveTicket, makeEvent, member, resetDb } from "./helpers";

beforeEach(resetDb);

const profileOf = (userId: string) => prisma.profile.findUniqueOrThrow({ where: { userId } });

describe("F14 profiles & follow", () => {
  it("F14-AC1: every member gets a unique username they can change, with Amharic display names", async () => {
    const a = await member("Selam Beats");
    const b = await member("Selam Beats");
    const [pa, pb] = [await profileOf(a.id), await profileOf(b.id)];
    expect(pa.username).toBe("selam_beats");
    expect(pb.username).toMatch(/^selam_beats_\d{4}$/);
    await expect(updateProfile(b.id, { username: "Selam_Beats" })).rejects.toMatchObject({ code: "USERNAME_TAKEN" });
    await expect(updateProfile(b.id, { username: "ሰላም" })).rejects.toMatchObject({ code: "USERNAME_INVALID" });
    const updated = await updateProfile(b.id, { username: "Selam.Official", displayName: "ሰላም ቢትስ", bio: "DJ from Bole" });
    expect(updated.username).toBe("selam.official");
    expect(updated.displayName).toBe("ሰላም ቢትስ");
    await expect(updateProfile(b.id, { bio: "x".repeat(151) })).rejects.toBeDefined();
    expect(await ensureProfile(b.id)).toMatchObject({ username: "selam.official" });
  });

  it("F14-AC3/AC4: follow and unfollow keep follower and following counters right", async () => {
    const fan = await member("Fan");
    const star = await member("Star");
    expect(await follow(fan.id, star.id)).toBe("active");
    expect(await follow(fan.id, star.id)).toBe("active");
    expect((await profileOf(star.id)).followersCount).toBe(1);
    expect((await profileOf(fan.id)).followingCount).toBe(1);
    await unfollow(fan.id, star.id);
    expect((await profileOf(star.id)).followersCount).toBe(0);
    expect((await profileOf(fan.id)).followingCount).toBe(0);
    await expect(follow(fan.id, fan.id)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("F14-AC4: private accounts approve requests; going public accepts the rest", async () => {
    const owner = await member("Owner", { private: true });
    const a = await member("A");
    const b = await member("B");
    await follow(a.id, owner.id);
    await follow(b.id, owner.id);
    expect((await followRequests(owner.id)).map((p) => p.userId).sort()).toEqual([a.id, b.id].sort());
    expect((await profileOf(owner.id)).followersCount).toBe(0);
    await approveFollowRequest(owner.id, a.id);
    expect((await profileOf(owner.id)).followersCount).toBe(1);
    await updateProfile(owner.id, { isPrivate: false });
    expect((await profileOf(owner.id)).followersCount).toBe(2);
    expect((await profileOf(b.id)).followingCount).toBe(1);
    expect(await followRequests(owner.id)).toHaveLength(0);
  });
});

describe("F17 find & add people", () => {
  it("F17-AC1: picking interests gives at least 10 people to follow", async () => {
    const me = await member("New Member");
    for (let i = 0; i < 12; i++) {
      const creator = await member(`Creator ${i}`);
      await setInterests(creator.id, ["music"]);
    }
    await setInterests(me.id, ["music", "not-a-real-interest"]);
    const suggestions = await suggestPeople(me.id, 12);
    expect(suggestions.length).toBeGreaterThanOrEqual(10);
    expect(suggestions.every((s) => s.profile.userId !== me.id)).toBe(true);
    expect(suggestions[0]!.reason).toBe("interest");
  });

  it("F17-AC3: people from the same events and mutual follows come first; followed and blocked people never show", async () => {
    const me = await member("Me");
    const friend = await member("Friend");
    const sameEvent = await member("Went Too");
    const mutual = await member("Mutual");
    const already = await member("Already");
    const event = await makeEvent();
    await giveTicket(me.id, event);
    await giveTicket(sameEvent.id, event);
    await follow(me.id, friend.id);
    await follow(me.id, already.id);
    await follow(friend.id, mutual.id);
    const s = await suggestPeople(me.id);
    const ids = s.map((x) => x.profile.userId);
    expect(ids).toContain(sameEvent.id);
    expect(ids).toContain(mutual.id);
    expect(ids).not.toContain(already.id);
    expect(ids).not.toContain(me.id);
    expect(s.find((x) => x.profile.userId === sameEvent.id)!.reason).toBe("sameEvent");
    expect(s.find((x) => x.profile.userId === mutual.id)!.reason).toBe("mutual");
  });

  it("F17-AC4: search people by name or @username, in Amharic and English", async () => {
    const u = await member("Hanna");
    await updateProfile(u.id, { username: "hanna.t", displayName: "ሃና ተስፋዬ" });
    expect((await searchPeople("ሃና", null)).map((p) => p.userId)).toEqual([u.id]);
    expect((await searchPeople("@HANNA.T", null)).map((p) => p.userId)).toEqual([u.id]);
    expect(await searchPeople("nobody", null)).toHaveLength(0);
  });

  it("F17-AC5: joining with a referral code records who invited you", async () => {
    const inviter = await member("Inviter");
    const code = (await profileOf(inviter.id)).referralCode;
    const newUser = await prisma.user.create({ data: { phone: "+251933333333", name: "Invited" } });
    const p = await ensureProfile(newUser.id, { referralCode: code.toLowerCase() });
    expect(p.referredById).toBe(inviter.id);
  });
});
