import { blobMeta, readBlob, readBlobRange } from "@dinkuan/social";

const MAX_RANGE = 2 * 1024 * 1024;

/** Serves uploaded media, with byte ranges so phones can seek in videos. Media ids are unguessable. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const headers: Record<string, string> = {
    "cache-control": "public, max-age=31536000, immutable",
    "accept-ranges": "bytes",
  };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (m && (m[1] || m[2])) {
    const meta = await blobMeta(id);
    if (!meta) return new Response(null, { status: 404 });
    const start = m[1] ? Number(m[1]) : Math.max(0, meta.size - Number(m[2]));
    if (start >= meta.size) return new Response(null, { status: 416, headers: { "content-range": `bytes */${meta.size}` } });
    const end = Math.min(m[1] && m[2] ? Number(m[2]) : meta.size - 1, meta.size - 1, start + MAX_RANGE - 1);
    const part = await readBlobRange(id, start, end);
    if (!part) return new Response(null, { status: 404 });
    return new Response(Buffer.from(part), {
      status: 206,
      headers: {
        ...headers,
        "content-type": meta.contentType,
        "content-range": `bytes ${start}-${end}/${meta.size}`,
        "content-length": String(end - start + 1),
      },
    });
  }
  const blob = await readBlob(id);
  if (!blob) return new Response(null, { status: 404 });
  return new Response(Buffer.from(blob.bytes), {
    headers: { ...headers, "content-type": blob.contentType, "content-length": String(blob.size) },
  });
}
