import { moderate } from "@dinkuan/moderation";
import { prisma } from "@dinkuan/db";
import { beforeEach, describe, expect, it } from "vitest";
import { createPost, ensureProfile, eventMoments, forYouFeed, getPost, hashtagPosts } from "../src";
import { makeEvent, member, resetDb } from "./helpers";

beforeEach(resetDb);

const TEEN = new Date(`${new Date().getUTCFullYear() - 15}-01-01T00:00:00Z`);

async function moderator() {
  const u = await member("Moderator");
  await prisma.userRole.create({ data: { userId: u.id, role: "admin" } });
  return u;
}

describe("F22-AC8 age rules in the social graph", () => {
  it("F22-AC8: age-restricted posts are for adults only; teens, unknown ages and visitors can't see them", async () => {
    const [author, adult, teen, legacy, mod] = [
      await member("Author"),
      await member("Adult"),
      await member("Teen", { birthDate: TEEN }),
      await member("Legacy", { birthDate: null }),
      await moderator(),
    ];
    const p = await createPost(author.id, { type: "text", caption: "After-party pics" });
    await moderate(mod.id, { targetType: "post", targetId: p.id, action: "age_restrict", reason: "nudity" });
    expect(await getPost(p.id, adult.id)).not.toBeNull();
    expect(await getPost(p.id, teen.id)).toBeNull();
    expect(await getPost(p.id, legacy.id)).toBeNull();
    expect(await getPost(p.id, null)).toBeNull();
    expect(await getPost(p.id, author.id)).not.toBeNull();
  });

  it("F22-AC8: posts tagged to a nightlife event are hidden from teens everywhere", async () => {
    const [author, adult, teen] = [await member("Author"), await member("Adult"), await member("Teen", { birthDate: TEEN })];
    const event = await makeEvent();
    const night = await createPost(author.id, { type: "text", caption: "Rooftop was wild #addisnights", eventId: event.id });
    const day = await createPost(author.id, { type: "text", caption: "Coffee ceremony #addisnights" });
    const ids = (page: { items: { id: string }[] }) => page.items.map((i) => i.id).sort();

    expect(ids(await forYouFeed(adult.id))).toEqual([night.id, day.id].sort());
    expect(ids(await forYouFeed(null))).toEqual([night.id, day.id].sort());
    expect(ids(await forYouFeed(teen.id))).toEqual([day.id]);
    expect(ids(await hashtagPosts("addisnights", teen.id))).toEqual([day.id]);
    expect((await eventMoments(event.id, teen.id)).items).toHaveLength(0);
    expect(await getPost(night.id, teen.id)).toBeNull();
    expect(await getPost(night.id, adult.id)).not.toBeNull();
  });

  it("F22-AC8: posts tagged to events that aren't nightlife stay visible to teens", async () => {
    const [author, teen] = [await member("Author"), await member("Teen", { birthDate: TEEN })];
    const event = await makeEvent();
    await prisma.event.update({ where: { id: event.id }, data: { category: "sports" } });
    const p = await createPost(author.id, { type: "text", caption: "Derby day", eventId: event.id });
    expect(await getPost(p.id, teen.id)).not.toBeNull();
  });

  it("F22-AC8: a new teen profile starts private; adults and unknown ages start public", async () => {
    const teen = await prisma.user.create({ data: { phone: "+251944444441", name: "Teen", birthDate: TEEN } });
    const adult = await prisma.user.create({ data: { phone: "+251944444442", name: "Adult", birthDate: new Date("1990-01-01T00:00:00Z") } });
    expect((await ensureProfile(teen.id)).isPrivate).toBe(true);
    expect((await ensureProfile(adult.id)).isPrivate).toBe(false);
  });
});
