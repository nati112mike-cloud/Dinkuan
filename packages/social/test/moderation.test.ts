import { prisma } from "@dinkuan/db";
import { moderate, moderationQueue } from "@dinkuan/moderation";
import { beforeEach, describe, expect, it } from "vitest";
import { addComment, createPost, follow, forYouFeed, getPost, listComments, mediaAccess, report, updateProfile } from "../src";
import { member, resetDb, uploaded } from "./helpers";

beforeEach(resetDb);

async function moderator() {
  const u = await member("Moderator");
  await prisma.userRole.create({ data: { userId: u.id, role: "admin" } });
  return u;
}

describe("F22 moderation in the social graph", () => {
  it("F22-AC2: a threatening caption never goes public and waits in the moderator queue", async () => {
    const [author, viewer] = [await member("Author"), await member("Viewer")];
    const clean = await createPost(author.id, { type: "text", caption: "See you at Fendika tonight" });
    expect(clean.status).toBe("public");
    const bad = await createPost(author.id, { type: "text", caption: "I will kill you at the show" });
    expect(bad.status).toBe("restricted");
    expect(await getPost(bad.id, viewer.id)).toBeNull();
    expect(await getPost(bad.id, null)).toBeNull();
    // The author still sees their own post while it's reviewed.
    expect(await getPost(bad.id, author.id)).not.toBeNull();
    const [item] = await moderationQueue();
    expect(item).toMatchObject({ targetType: "post", targetId: bad.id, automated: true, severity: 4 });
  });

  it("F22-AC2: a flagged comment stays hidden, isn't counted and is queued", async () => {
    const [author, commenter] = [await member("Author"), await member("Commenter")];
    const p = await createPost(author.id, { type: "text", caption: "Rate my outfit" });
    const c = await addComment(commenter.id, p.id, "free money here bit.ly/x");
    expect(c.status).toBe("hidden");
    expect((await prisma.post.findUniqueOrThrow({ where: { id: p.id } })).commentCount).toBe(0);
    expect((await listComments(p.id, author.id)).map((x: { id: string }) => x.id)).not.toContain(c.id);
    expect((await moderationQueue())[0]).toMatchObject({ targetType: "comment", targetId: c.id });
  });

  it("F22-AC2: profiles with flagged names or bios can't be saved", async () => {
    const u = await member();
    await expect(updateProfile(u.id, { bio: "DM for crypto giveaway" })).rejects.toMatchObject({ code: "CONTENT_FLAGGED" });
    await updateProfile(u.id, { bio: "DJ from Piassa" });
  });

  it("F22-AC5: a suspended member can't post, comment or follow", async () => {
    const [u, other] = [await member(), await member()];
    const p = await createPost(other.id, { type: "text", caption: "hello" });
    await prisma.user.update({ where: { id: u.id }, data: { suspendedUntil: new Date(Date.now() + 86400_000) } });
    await expect(createPost(u.id, { type: "text", caption: "hi" })).rejects.toMatchObject({ code: "ACCOUNT_SUSPENDED" });
    await expect(addComment(u.id, p.id, "hi")).rejects.toMatchObject({ code: "ACCOUNT_SUSPENDED" });
    await expect(follow(u.id, other.id)).rejects.toMatchObject({ code: "ACCOUNT_SUSPENDED" });
  });

  it("F22-AC5: a banned member's posts disappear for everyone", async () => {
    const [author, viewer, mod] = [await member(), await member(), await moderator()];
    const p = await createPost(author.id, { type: "text", caption: "hello Addis" });
    expect((await forYouFeed(viewer.id)).items.map((i) => i.id)).toContain(p.id);
    await moderate(mod.id, { targetType: "profile", targetId: author.id, action: "ban", reason: "scam" });
    expect(await getPost(p.id, viewer.id)).toBeNull();
    expect(await getPost(p.id, null)).toBeNull();
    expect((await forYouFeed(viewer.id)).items).toHaveLength(0);
  });

  it("F22-AC4: an age-restricted post is for signed-in members only and stays out of feeds", async () => {
    const [author, viewer, mod] = [await member(), await member(), await moderator()];
    const p = await createPost(author.id, { type: "text", caption: "After-party at Club H2O" });
    await moderate(mod.id, { targetType: "post", targetId: p.id, action: "age_restrict", reason: "nudity" });
    expect(await getPost(p.id, null)).toBeNull();
    expect(await getPost(p.id, viewer.id)).not.toBeNull();
    expect((await forYouFeed(viewer.id)).items.map((i) => i.id)).not.toContain(p.id);
  });

  it("F22-AC3: reporting goes through the moderation package, with message and review targets", async () => {
    const [author, reporter] = [await member(), await member()];
    const p = await createPost(author.id, { type: "text", caption: "hello" });
    const r = await report(reporter.id, { targetType: "post", targetId: p.id, reason: "threat", details: "said it at the gate" });
    expect(r).toMatchObject({ severity: 4, subjectId: author.id });
  });

  it("CLAUDE.md rule 14: media on a post that isn't public is only served to its uploader and moderators", async () => {
    const [author, viewer, mod] = [await member(), await member(), await moderator()];
    const blob = await uploaded(author.id);
    const p = await createPost(author.id, { type: "photo", caption: "free money bit.ly/x", media: [{ blobId: blob, width: 10, height: 10 }] });
    expect(p.status).toBe("restricted");
    expect(await mediaAccess(blob, { id: viewer.id, admin: false })).toBe("denied");
    expect(await mediaAccess(blob, null)).toBe("denied");
    expect(await mediaAccess(blob, { id: author.id, admin: false })).toBe("private");
    expect(await mediaAccess(blob, { id: mod.id, admin: true })).toBe("private");
    await moderate(mod.id, { targetType: "post", targetId: p.id, action: "dismiss", reason: "spam" });
    expect(await mediaAccess(blob, null)).toBe("public");
  });

  it("trade licences are private to their uploader and admins", async () => {
    const [owner, viewer] = [await member(), await member()];
    const blob = await uploaded(owner.id);
    await prisma.organiser.create({ data: { ownerUserId: owner.id, name: "Org", type: "business", licenceUrl: `/api/media/${blob}` } });
    expect(await mediaAccess(blob, { id: viewer.id, admin: false })).toBe("denied");
    expect(await mediaAccess(blob, { id: owner.id, admin: false })).toBe("private");
    expect(await mediaAccess(blob, { id: viewer.id, admin: true })).toBe("private");
  });
});
