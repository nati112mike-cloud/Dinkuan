import { DomainError } from "@dinkuan/core";
import { prisma } from "@dinkuan/db";

/**
 * F15-AC6: resumable uploads for weak networks. The client sends the file in small chunks
 * with the byte offset; after a dropped connection it asks how much arrived and carries on.
 * Demo storage keeps the bytes in Postgres (MediaBlob); swap for object storage before launch.
 */
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
export const CHUNK_BYTES = 512 * 1024;
/** Audit S7: per member, per 24 hours (uploads live in Postgres until object storage). */
export const DAILY_UPLOAD_BYTES = 300 * 1024 * 1024;
export const DAILY_UPLOAD_FILES = 100;

export function mediaUrl(blobId: string) {
  return `/api/media/${blobId}`;
}

export async function startUpload(uploaderId: string, input: { contentType: string; size: number }) {
  const isImage = IMAGE_TYPES.includes(input.contentType);
  const isVideo = VIDEO_TYPES.includes(input.contentType);
  if (!isImage && !isVideo) throw new DomainError("UPLOAD_TYPE");
  if (!Number.isInteger(input.size) || input.size <= 0) throw new DomainError("VALIDATION");
  if (input.size > (isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES)) throw new DomainError("UPLOAD_TOO_LARGE");
  const today = await prisma.mediaBlob.aggregate({
    where: { uploaderId, createdAt: { gte: new Date(Date.now() - 86400_000) } },
    _sum: { size: true },
    _count: { _all: true },
  });
  if (today._count._all >= DAILY_UPLOAD_FILES || (today._sum.size ?? 0) + input.size > DAILY_UPLOAD_BYTES) {
    throw new DomainError("UPLOAD_QUOTA");
  }
  const blob = await prisma.mediaBlob.create({
    data: { uploaderId, contentType: input.contentType, size: input.size },
    select: { id: true, size: true, received: true },
  });
  return { ...blob, url: mediaUrl(blob.id), chunkBytes: CHUNK_BYTES };
}

export async function uploadStatus(uploaderId: string, id: string) {
  const blob = await prisma.mediaBlob.findFirst({ where: { id, uploaderId }, select: { id: true, size: true, received: true } });
  if (!blob) throw new DomainError("NOT_FOUND");
  return blob;
}

/**
 * Appends a chunk at `offset`. A chunk for the wrong offset (a retry of something that already
 * arrived, or a gap) changes nothing; the caller gets the real offset back and resumes from there.
 */
export async function appendChunk(uploaderId: string, id: string, offset: number, chunk: Uint8Array) {
  if (chunk.byteLength === 0 || chunk.byteLength > CHUNK_BYTES) throw new DomainError("VALIDATION", "Bad chunk size");
  const updated = await prisma.$executeRaw`
    UPDATE media_blobs SET bytes = bytes || ${Buffer.from(chunk)}, received = received + ${chunk.byteLength}
    WHERE id = ${id}::uuid AND uploader_id = ${uploaderId}::uuid AND received = ${offset}
      AND received + ${chunk.byteLength} <= size`;
  const status = await uploadStatus(uploaderId, id);
  return { ...status, accepted: updated === 1 };
}

/** What the first bytes say a file is, whatever the client declared. */
export function sniffType(head: Uint8Array): "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "video/mp4" | "video/quicktime" | "video/webm" | null {
  const at = (i: number, ...b: number[]) => b.every((x, j) => head[i + j] === x);
  const ascii = (i: number, str: string) => at(i, ...[...str].map((c) => c.charCodeAt(0)));
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (ascii(0, "GIF8")) return "image/gif";
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";
  if (at(0, 0x1a, 0x45, 0xdf, 0xa3)) return "video/webm";
  if (ascii(4, "ftyp")) return ascii(8, "qt  ") ? "video/quicktime" : "video/mp4";
  return null;
}

/**
 * A finished upload of the caller's. The first bytes must match the declared kind (an image
 * stays an image, a video a video), so a renamed file can't be served as something else.
 */
export async function assertComplete(uploaderId: string, blobId: string) {
  const blob = await prisma.mediaBlob.findFirst({ where: { id: blobId, uploaderId }, select: { size: true, received: true, contentType: true } });
  if (!blob) throw new DomainError("NOT_FOUND", "Upload not found");
  if (blob.received !== blob.size) throw new DomainError("UPLOAD_INCOMPLETE");
  const [row] = await prisma.$queryRaw<{ head: Uint8Array }[]>`SELECT substring(bytes FROM 1 FOR 16) AS head FROM media_blobs WHERE id = ${blobId}::uuid`;
  const sniffed = sniffType(new Uint8Array(row?.head ?? []));
  const family = (t: string | null) => t?.split("/")[0];
  if (!sniffed || family(sniffed) !== family(blob.contentType)) throw new DomainError("UPLOAD_TYPE");
  return blob;
}

/**
 * S8: profile and vendor pictures must be the caller's own finished image upload, never an
 * outside URL (which would track viewers and skip screening).
 */
export async function assertOwnImage(userId: string, url: string) {
  const id = /^\/api\/media\/([0-9a-f-]{36})$/.exec(url)?.[1];
  if (!id) throw new DomainError("VALIDATION", "Upload the picture here");
  const blob = await assertComplete(userId, id);
  if (!IMAGE_TYPES.includes(blob.contentType)) throw new DomainError("UPLOAD_TYPE");
}

export async function blobMeta(id: string) {
  const meta = await prisma.mediaBlob.findUnique({ where: { id }, select: { contentType: true, size: true, received: true } });
  return meta && meta.received === meta.size ? meta : null;
}

export async function readBlob(id: string) {
  const row = await prisma.mediaBlob.findUnique({ where: { id }, select: { bytes: true, contentType: true, size: true, received: true } });
  return row && row.received === row.size ? row : null;
}

/** A byte range of a finished blob (videos need range requests to seek on phones). */
export async function readBlobRange(id: string, start: number, end: number) {
  const [row] = await prisma.$queryRaw<{ part: Uint8Array }[]>`
    SELECT substring(bytes FROM ${start + 1}::int FOR ${end - start + 1}::int) AS part FROM media_blobs WHERE id = ${id}::uuid`;
  return row?.part ?? null;
}

/**
 * Who may fetch an uploaded file (CLAUDE.md rule 14, F22). Media on a post follows the post:
 * while it is being screened, restricted or removed only its uploader and moderators get it.
 * Trade licences are private to their uploader and admins. Everything else (avatars, posters,
 * portfolio) is public. `public` may be cached briefly; `private` must not be cached at all.
 */
export async function mediaAccess(blobId: string, viewer: { id: string; admin: boolean } | null): Promise<"public" | "private" | "denied"> {
  const url = mediaUrl(blobId);
  const blob = await prisma.mediaBlob.findUnique({ where: { id: blobId }, select: { uploaderId: true } });
  if (!blob) return "denied";
  const privileged = !!viewer && (viewer.admin || viewer.id === blob.uploaderId);
  const licence = await prisma.organiser.count({ where: { licenceUrl: url } });
  if (licence > 0) return privileged ? "private" : "denied";
  const posts = await prisma.media.findMany({
    where: { OR: [{ url }, { thumbUrl: url }] },
    select: { post: { select: { status: true, author: { select: { bannedAt: true } } } } },
  });
  if (posts.length === 0 || posts.some((m) => m.post.status === "public" && !m.post.author.bannedAt)) return "public";
  return privileged ? "private" : "denied";
}
