import { prisma } from "@dinkuan/db";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addComment,
  createPost,
  deleteComment,
  follow,
  followingFeed,
  forYouFeed,
  hideComment,
  listComments,
  pinComment,
  react,
  recordView,
  reelsFeed,
  refreshRank,
  savedPosts,
  sharePost,
  toggleCommentLike,
  toggleSave,
  unreact,
  updateProfile,
} from "../src";
import { member, resetDb, uploaded } from "./helpers";

beforeEach(resetDb);

const text = (caption: string) => ({ type: "text" as const, caption });

async function backdate(postId: string, hours: number) {
  await prisma.post.update({ where: { id: postId }, data: { createdAt: new Date(Date.now() - hours * 3600_000) } });
  await refreshRank(prisma, postId);
}

describe("F16 feed & reels", () => {
  it("F16-AC6: For You ranks engaging and recent posts first", async () => {
    const author = await member("Author");
    const fans = await Promise.all(Array.from({ length: 6 }, (_, i) => member(`Fan ${i}`)));
    const quiet = await createPost(author.id, text("quiet"));
    const loved = await createPost(author.id, text("loved"));
    for (const f of fans) await react(f.id, loved.id, "fire");
    const old = await createPost(author.id, text("old news"));
    await backdate(old.id, 72);
    const ids = (await forYouFeed(null)).items.map((p) => p.id);
    expect(ids).toEqual([loved.id, quiet.id, old.id]);
  });

  it("F16-AC6: posts from people you follow get a relationship boost", async () => {
    const me = await member("Me");
    const friend = await member("Friend");
    const stranger = await member("Stranger");
    const strangerPost = await createPost(stranger.id, text("stranger"));
    const friendPost = await createPost(friend.id, text("friend"));
    await backdate(friendPost.id, 6); // a bit older, so it would rank lower without the boost
    expect((await forYouFeed(null)).items[0]!.id).toBe(strangerPost.id);
    await follow(me.id, friend.id);
    expect((await forYouFeed(me.id)).items[0]!.id).toBe(friendPost.id);
  });

  it("CLAUDE.md rule 19: cursor pages never repeat or skip posts", async () => {
    const a = await member("A");
    const b = await member("B");
    await follow(a.id, b.id);
    for (let i = 0; i < 25; i++) await createPost((i % 2 ? a : b).id, text(`post ${i}`));
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await forYouFeed(null, cursor, 10);
      seen.push(...page.items.map((p) => p.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);

    const fseen: string[] = [];
    let fc: string | null = null;
    do {
      const page = await followingFeed(a.id, fc, 7);
      fseen.push(...page.items.map((p) => p.id));
      fc = page.nextCursor;
    } while (fc);
    expect(new Set(fseen).size).toBe(25);
  });

  it("F16-AC1: Following shows people you follow and yourself, newest first", async () => {
    const me = await member("Me");
    const friend = await member("Friend");
    const stranger = await member("Stranger");
    await follow(me.id, friend.id);
    const p1 = await createPost(friend.id, text("friend 1"));
    await createPost(stranger.id, text("stranger"));
    const p2 = await createPost(me.id, text("mine"));
    expect((await followingFeed(me.id)).items.map((p) => p.id)).toEqual([p2.id, p1.id]);
  });

  it("F16-AC7: the reels player shows only videos and can open on a chosen reel", async () => {
    const u = await member("Creator");
    await createPost(u.id, text("not a reel"));
    const reels = [];
    for (let i = 0; i < 3; i++) {
      const blobId = await uploaded(u.id, "video/mp4", 500);
      reels.push(await createPost(u.id, { type: "reel", media: [{ blobId, width: 720, height: 1280, durationS: 15 }] }));
    }
    const feed = await reelsFeed(null);
    expect(feed.items).toHaveLength(3);
    expect(feed.items.every((p) => p.type === "reel")).toBe(true);
    const start = reels[0]!.id;
    const opened = await reelsFeed(null, null, 6, start);
    expect(opened.items[0]!.id).toBe(start);
    expect(new Set(opened.items.map((p) => p.id)).size).toBe(3);
  });

  it("F16-AC2: one reaction per person; changing it keeps the count; likes received add up", async () => {
    const author = await member("Author");
    const fan = await member("Fan");
    const post = await createPost(author.id, text("react to me"));
    expect((await react(fan.id, post.id, "like")).reactionCount).toBe(1);
    expect((await react(fan.id, post.id, "fire")).reactionCount).toBe(1);
    expect((await prisma.reaction.findFirstOrThrow()).type).toBe("fire");
    expect((await prisma.profile.findUniqueOrThrow({ where: { userId: author.id } })).likesReceived).toBe(1);
    expect((await unreact(fan.id, post.id)).reactionCount).toBe(0);
    expect((await prisma.profile.findUniqueOrThrow({ where: { userId: author.id } })).likesReceived).toBe(0);
  });

  it("F16-AC3: comments with one level of replies, likes, pin, hide, delete and keyword filter", async () => {
    const owner = await member("Owner");
    const fan = await member("Fan");
    const troll = await member("Troll");
    await updateProfile(owner.id, { hiddenWords: ["boring"] });
    const post = await createPost(owner.id, text("new mix out"));

    const c1 = await addComment(fan.id, post.id, "fire mix!");
    const reply = await addComment(owner.id, post.id, "thank you", c1.id);
    const replyToReply = await addComment(fan.id, post.id, "welcome", reply.id);
    expect(replyToReply.parentId).toBe(c1.id);
    const filtered = await addComment(troll.id, post.id, "so BORING");
    expect(filtered.status).toBe("hidden");

    expect((await toggleCommentLike(owner.id, c1.id)).likeCount).toBe(1);
    await pinComment(owner.id, c1.id);
    await expect(pinComment(fan.id, c1.id)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const asFan = await listComments(post.id, fan.id);
    expect(asFan.map((c) => c.body)).toEqual(["fire mix!"]);
    expect(asFan[0]!.pinned).toBe(true);
    expect(asFan[0]!.replies.map((r) => r.body)).toEqual(["thank you", "welcome"]);
    expect((await listComments(post.id, troll.id)).map((c) => c.body)).toContain("so BORING");
    expect((await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).commentCount).toBe(3);

    const c2 = await addComment(troll.id, post.id, "meh");
    await hideComment(owner.id, c2.id);
    expect((await listComments(post.id, fan.id)).map((c) => c.body)).not.toContain("meh");
    await deleteComment(owner.id, c1.id);
    expect(await listComments(post.id, fan.id)).toHaveLength(0);
    expect((await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).commentCount).toBe(0);
  });

  it("F16-AC4/AC5: shares count toward ranking; saves go into private collections", async () => {
    const author = await member("Author");
    const me = await member("Me");
    const post = await createPost(author.id, text("share me"));
    const before = (await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).rankKey;
    await sharePost(me.id, post.id, "repost", "look at this");
    const after = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(after.shareCount).toBe(1);
    expect(after.rankKey).toBeGreaterThan(before);

    expect(await toggleSave(me.id, post.id, "Wedding ideas")).toEqual({ saved: true });
    const saved = await savedPosts(me.id);
    expect(saved.collections).toEqual(["Wedding ideas"]);
    expect(await toggleSave(me.id, post.id, "Wedding ideas")).toEqual({ saved: false });
    expect((await savedPosts(author.id)).rows).toHaveLength(0);
  });

  it("F16-AC9: watch time and completions are tracked", async () => {
    const u = await member("U");
    const blobId = await uploaded(u.id, "video/mp4", 500);
    const reel = await createPost(u.id, { type: "reel", media: [{ blobId, width: 720, height: 1280, durationS: 10 }] });
    await recordView(reel.id, null, 4000, false);
    await recordView(reel.id, u.id, 10_000, true);
    const p = await prisma.post.findUniqueOrThrow({ where: { id: reel.id } });
    expect(p.viewCount).toBe(2);
    expect(p.completions).toBe(1);
    expect(await prisma.watchEvent.count({ where: { postId: reel.id } })).toBe(2);
  });

  it("F22-AC9: posting is rate limited to stop spam bots", async () => {
    const bot = await member("Bot");
    for (let i = 0; i < 20; i++) await createPost(bot.id, text(`spam ${i}`));
    await expect(createPost(bot.id, text("one more"))).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});
