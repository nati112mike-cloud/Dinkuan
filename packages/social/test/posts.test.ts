import { prisma } from "@dinkuan/db";
import { beforeEach, describe, expect, it } from "vitest";
import {
  appendChunk,
  createPost,
  deletePost,
  editCaption,
  eventMoments,
  getPost,
  hashtagPosts,
  startUpload,
  updateProfile,
  uploadStatus,
} from "../src";
import { makeEvent, member, resetDb, uploaded } from "./helpers";

beforeEach(resetDb);

describe("F15 posts", () => {
  it("F15-AC1: text, photo (1–10), meme (one image) and video (up to 3 minutes) posts", async () => {
    const u = await member("Creator");
    await expect(createPost(u.id, { type: "text", caption: "  " })).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await createPost(u.id, { type: "text", caption: "Selam Addis" })).status).toBe("public");

    const photos = await Promise.all(Array.from({ length: 3 }, () => uploaded(u.id)));
    const carousel = await createPost(u.id, {
      type: "photo",
      media: photos.map((blobId) => ({ blobId, width: 1080, height: 1350 })),
    });
    expect(await prisma.media.count({ where: { postId: carousel.id } })).toBe(3);
    const eleven = await Promise.all(Array.from({ length: 11 }, () => uploaded(u.id)));
    await expect(
      createPost(u.id, { type: "photo", media: eleven.map((blobId) => ({ blobId, width: 1, height: 1 })) }),
    ).rejects.toBeDefined();

    const two = [await uploaded(u.id), await uploaded(u.id)];
    await expect(
      createPost(u.id, { type: "meme", media: two.map((blobId) => ({ blobId, width: 1, height: 1 })) }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const video = await uploaded(u.id, "video/mp4", 2000);
    await expect(
      createPost(u.id, { type: "reel", media: [{ blobId: video, width: 720, height: 1280, durationS: 181 }] }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const reel = await createPost(u.id, { type: "reel", media: [{ blobId: video, width: 720, height: 1280, durationS: 30 }] });
    expect(reel.status).toBe("public");
    expect((await prisma.profile.findUniqueOrThrow({ where: { userId: u.id } })).postsCount).toBe(3);
  });

  it("F15-AC1: someone else's or an unfinished upload can't be attached", async () => {
    const u = await member("U");
    const other = await member("Other");
    const theirs = await uploaded(other.id);
    await expect(createPost(u.id, { type: "photo", media: [{ blobId: theirs, width: 1, height: 1 }] })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const half = await startUpload(u.id, { contentType: "image/jpeg", size: 2000 });
    await appendChunk(u.id, half.id, 0, new Uint8Array(1000));
    await expect(createPost(u.id, { type: "photo", media: [{ blobId: half.id, width: 1, height: 1 }] })).rejects.toMatchObject({
      code: "UPLOAD_INCOMPLETE",
    });
  });

  it("F15-AC2: event tag, hashtags and @mentions (mentioned people are notified)", async () => {
    const author = await member("Author");
    const friend = await member("Friend");
    await updateProfile(friend.id, { username: "the.friend" });
    const event = await makeEvent();
    const post = await createPost(author.id, { type: "text", caption: "Great night with @the.friend #ድንኳን #Fendika", eventId: event.id });
    expect(await prisma.mention.findMany({ where: { postId: post.id } })).toEqual([{ postId: post.id, userId: friend.id }]);
    expect((await hashtagPosts("fendika", null)).items.map((p) => p.id)).toEqual([post.id]);
    expect((await hashtagPosts("ድንኳን", null)).items.map((p) => p.id)).toEqual([post.id]);
    expect(await prisma.notification.count({ where: { recipientId: friend.id, type: "mention" } })).toBe(1);
  });

  it("F15-AC4: captions can be edited within 24 hours; posts can be deleted any time", async () => {
    const u = await member("U");
    const other = await member("Other");
    const post = await createPost(u.id, { type: "text", caption: "first #old" });
    await expect(editCaption(other.id, post.id, "hacked")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const edited = await editCaption(u.id, post.id, "second #new");
    expect(edited.caption).toBe("second #new");
    expect(edited.editedAt).not.toBeNull();
    expect((await hashtagPosts("old", null)).items).toHaveLength(0);
    expect((await hashtagPosts("new", null)).items).toHaveLength(1);
    await expect(editCaption(u.id, post.id, "too late", new Date(Date.now() + 25 * 3600_000))).rejects.toMatchObject({
      code: "EDIT_WINDOW_CLOSED",
    });
    await deletePost(u.id, post.id);
    expect(await getPost(post.id, u.id)).toBeNull();
    expect((await prisma.profile.findUniqueOrThrow({ where: { userId: u.id } })).postsCount).toBe(0);
  });

  it("F15-AC5: posts tagged to an event show on the event as Moments", async () => {
    const event = await makeEvent();
    const a = await member("A");
    const tagged = await createPost(a.id, { type: "text", caption: "what a night", eventId: event.id });
    await createPost(a.id, { type: "text", caption: "unrelated" });
    const followersOnly = await createPost(a.id, { type: "text", caption: "fans only", eventId: event.id, audience: "followers" });
    const moments = await eventMoments(event.id, null);
    expect(moments.items.map((p) => p.id)).toEqual([tagged.id]);
    expect((await eventMoments(event.id, a.id)).items.map((p) => p.id)).toEqual([followersOnly.id, tagged.id]);
  });

  it("F15-AC6: uploads resume from where they stopped; retried chunks are not added twice", async () => {
    const u = await member("U");
    const up = await startUpload(u.id, { contentType: "video/mp4", size: 1500 });
    expect((await appendChunk(u.id, up.id, 0, new Uint8Array(1000).fill(1))).received).toBe(1000);
    // The connection drops and the phone re-sends the first chunk.
    const retry = await appendChunk(u.id, up.id, 0, new Uint8Array(1000).fill(1));
    expect(retry).toMatchObject({ accepted: false, received: 1000 });
    const status = await uploadStatus(u.id, up.id);
    const done = await appendChunk(u.id, up.id, status.received, new Uint8Array(500).fill(2));
    expect(done).toMatchObject({ accepted: true, received: 1500, size: 1500 });
    await expect(startUpload(u.id, { contentType: "application/pdf", size: 10 })).rejects.toMatchObject({ code: "UPLOAD_TYPE" });
    await expect(startUpload(u.id, { contentType: "image/jpeg", size: 6 * 1024 * 1024 })).rejects.toMatchObject({
      code: "UPLOAD_TOO_LARGE",
    });
  });

  it("F15-AC7: every post is screened before it becomes public", async () => {
    const u = await member("U");
    const ok = await createPost(u.id, { type: "text", caption: "Meskel was beautiful" });
    const spam = await createPost(u.id, { type: "text", caption: "crypto giveaway here" });
    expect(ok.status).toBe("public");
    expect(spam.status).toBe("restricted");
  });
});

describe("PDPP post deletion", () => {
  it("PDPP: deleting a post deletes its uploaded files too", async () => {
    const u = await member("Creator");
    const blob = await uploaded(u.id);
    const p = await createPost(u.id, { type: "photo", media: [{ blobId: blob, width: 10, height: 10 }] });
    await deletePost(u.id, p.id);
    expect(await prisma.mediaBlob.findUnique({ where: { id: blob } })).toBeNull();
  });
});
