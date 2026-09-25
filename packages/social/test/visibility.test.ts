import { prisma } from "@dinkuan/db";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addComment,
  approveFollowRequest,
  block,
  canSeePost,
  createPost,
  follow,
  followingFeed,
  forYouFeed,
  getProfileView,
  mute,
  profilePosts,
  searchPeople,
} from "../src";
import { member, resetDb } from "./helpers";

beforeEach(resetDb);

const text = (caption: string, audience: "public" | "followers" = "public") => ({ type: "text" as const, caption, audience });

describe("CLAUDE.md rule 15: one visibility helper for every social query", () => {
  it("public posts are visible to everyone, including people who are not logged in", async () => {
    const author = await member("Author");
    const other = await member("Other");
    const post = await createPost(author.id, text("hello Addis"));
    expect(await canSeePost(post.id, null)).toBe(true);
    expect(await canSeePost(post.id, other.id)).toBe(true);
  });

  it("F15-AC3: followers-only posts are visible to accepted followers and the author only", async () => {
    const author = await member("Author");
    const fan = await member("Fan");
    const stranger = await member("Stranger");
    await follow(fan.id, author.id);
    const post = await createPost(author.id, text("for my people", "followers"));
    expect(await canSeePost(post.id, fan.id)).toBe(true);
    expect(await canSeePost(post.id, author.id)).toBe(true);
    expect(await canSeePost(post.id, stranger.id)).toBe(false);
    expect(await canSeePost(post.id, null)).toBe(false);
  });

  it("F14-AC4: a private account's posts show only after the follow request is approved", async () => {
    const author = await member("Private", { private: true });
    const fan = await member("Fan");
    const post = await createPost(author.id, text("private life"));
    expect(await follow(fan.id, author.id)).toBe("requested");
    expect(await canSeePost(post.id, fan.id)).toBe(false);
    expect(await canSeePost(post.id, null)).toBe(false);
    expect((await getProfileView("private", fan.id))?.canSeePosts ?? false).toBe(false);
    await approveFollowRequest(author.id, fan.id);
    expect(await canSeePost(post.id, fan.id)).toBe(true);
  });

  it("F14-AC5: block hides both sides from each other and removes follows", async () => {
    const a = await member("Abebe");
    const b = await member("Bethlehem");
    await follow(a.id, b.id);
    await follow(b.id, a.id);
    const postA = await createPost(a.id, text("from A"));
    const postB = await createPost(b.id, text("from B"));
    await block(a.id, b.id);

    expect(await canSeePost(postA.id, b.id)).toBe(false);
    expect(await canSeePost(postB.id, a.id)).toBe(false);
    const profileA = await prisma.profile.findUniqueOrThrow({ where: { userId: a.id } });
    const profileB = await prisma.profile.findUniqueOrThrow({ where: { userId: b.id } });
    expect(await getProfileView(profileA.username, b.id)).toBeNull();
    expect(await getProfileView(profileB.username, a.id)).toBeNull();
    expect(await prisma.follow.count()).toBe(0);
    expect([profileA.followersCount, profileA.followingCount, profileB.followersCount, profileB.followingCount]).toEqual([0, 0, 0, 0]);
    await expect(follow(b.id, a.id)).rejects.toMatchObject({ code: "BLOCKED" });
    await expect(addComment(b.id, postA.id, "hi")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await searchPeople("Abebe", b.id)).toHaveLength(0);
    expect(await searchPeople("Abebe", null)).toHaveLength(1);
  });

  it("F14-AC5: mute hides someone from your feeds but not from their profile", async () => {
    const me = await member("Me");
    const loud = await member("Loud");
    await follow(me.id, loud.id);
    const post = await createPost(loud.id, text("so loud"));
    await mute(me.id, loud.id);
    expect((await forYouFeed(me.id)).items.map((p) => p.id)).not.toContain(post.id);
    expect((await followingFeed(me.id)).items.map((p) => p.id)).not.toContain(post.id);
    expect((await profilePosts(loud.id, "posts", me.id)).items.map((p) => p.id)).toContain(post.id);
  });

  it("CLAUDE.md rule 14: restricted and removed posts stay hidden from others", async () => {
    const author = await member("Spammer");
    const other = await member("Other");
    const post = await createPost(author.id, text("free money at bit.ly/xyz"));
    expect(post.status).toBe("restricted");
    expect(await canSeePost(post.id, other.id)).toBe(false);
    expect(await canSeePost(post.id, author.id)).toBe(true);
    await prisma.post.update({ where: { id: post.id }, data: { status: "removed" } });
    expect(await canSeePost(post.id, author.id)).toBe(false);
  });
});
