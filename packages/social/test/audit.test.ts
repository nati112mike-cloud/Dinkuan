import { prisma } from "@dinkuan/db";
import { beforeEach, describe, expect, it } from "vitest";
import { appendChunk, createPost, DAILY_UPLOAD_FILES, recordView, sharePost, sniffType, startUpload, updateProfile } from "../src";
import { fakeFile, member, resetDb, uploaded } from "./helpers";

beforeEach(resetDb);

describe("launch audit: uploads, pictures and counters", () => {
  it("S8: profile pictures must be your own finished image upload, never an outside URL", async () => {
    const [me, other] = [await member("Me"), await member("Other")];
    await expect(updateProfile(me.id, { avatarUrl: "https://tracker.example/pixel.png" })).rejects.toMatchObject({ code: "VALIDATION" });
    const theirs = await uploaded(other.id);
    await expect(updateProfile(me.id, { avatarUrl: `/api/media/${theirs}` })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const video = await uploaded(me.id, "video/mp4");
    await expect(updateProfile(me.id, { coverUrl: `/api/media/${video}` })).rejects.toMatchObject({ code: "UPLOAD_TYPE" });
    const mine = await uploaded(me.id);
    expect((await updateProfile(me.id, { avatarUrl: `/api/media/${mine}` })).avatarUrl).toBe(`/api/media/${mine}`);
  });

  it("S6: a file whose first bytes don't match its declared type can't be attached", async () => {
    const me = await member("Me");
    const up = await startUpload(me.id, { contentType: "image/jpeg", size: 100 });
    await appendChunk(me.id, up.id, 0, new TextEncoder().encode("<html><script>alert(1)</script></html>".padEnd(100, " ")));
    await expect(createPost(me.id, { type: "photo", media: [{ blobId: up.id, width: 1, height: 1 }] })).rejects.toMatchObject({ code: "UPLOAD_TYPE" });
    expect(sniffType(fakeFile("image/png", 16))).toBe("image/png");
    expect(sniffType(fakeFile("video/mp4", 16))).toBe("video/mp4");
  });

  it("S7: each member has a daily upload quota", async () => {
    const me = await member("Me");
    await prisma.mediaBlob.createMany({ data: Array.from({ length: DAILY_UPLOAD_FILES }, () => ({ uploaderId: me.id, contentType: "image/jpeg", size: 10 })) });
    await expect(startUpload(me.id, { contentType: "image/jpeg", size: 10 })).rejects.toMatchObject({ code: "UPLOAD_QUOTA" });
  });

  it("S16: replays and repeat shares don't inflate a post's counts", async () => {
    const [author, fan] = [await member("Author"), await member("Fan")];
    const p = await createPost(author.id, { type: "text", caption: "Watch this" });
    await recordView(p.id, fan.id, 5000, false);
    await recordView(p.id, fan.id, 9000, true);
    await recordView(p.id, fan.id, 9000, true);
    await sharePost(fan.id, p.id, "external");
    await sharePost(fan.id, p.id, "external");
    const after = await prisma.post.findUniqueOrThrow({ where: { id: p.id } });
    expect(after).toMatchObject({ viewCount: 1, completions: 1, shareCount: 1 });
    // Every watch is still kept for creator analytics.
    expect(await prisma.watchEvent.count({ where: { postId: p.id } })).toBe(3);
  });
});
