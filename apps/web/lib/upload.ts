/**
 * Browser-side media helpers for the composer (F15-AC6): shrink photos on the phone before
 * upload, read video size/duration and a thumbnail, and upload in resumable chunks that retry
 * on weak networks.
 */

export type Prepared = { blob: Blob; contentType: string; width: number; height: number; durationS?: number };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", quality));
}

/** Resizes to at most `maxDim` px on the long side and re-encodes as JPEG. */
export async function compressImage(file: Blob, maxDim = 1600): Promise<Prepared> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.round(img.naturalWidth * scale);
    const height = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
    return { blob: await canvasToJpeg(canvas), contentType: "image/jpeg", width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Draws a meme: the image with bold outlined top and bottom text. */
export async function renderMeme(file: Blob, top: string, bottom: string, canvas?: HTMLCanvasElement): Promise<Prepared> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.round(img.naturalWidth * scale);
    const height = Math.round(img.naturalHeight * scale);
    const c = canvas ?? document.createElement("canvas");
    c.width = width;
    c.height = height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0, width, height);
    const size = Math.round(width / 11);
    ctx.font = `900 ${size}px "Noto Sans Ethiopic", Impact, "Arial Black", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = "white";
    ctx.strokeStyle = "black";
    ctx.lineWidth = Math.max(2, size / 9);
    ctx.lineJoin = "round";
    const draw = (text: string, y: number, baseline: CanvasTextBaseline) => {
      if (!text.trim()) return;
      ctx.textBaseline = baseline;
      const t = text.toUpperCase();
      ctx.strokeText(t, width / 2, y, width * 0.94);
      ctx.fillText(t, width / 2, y, width * 0.94);
    };
    draw(top, size * 0.3, "top");
    draw(bottom, height - size * 0.3, "bottom");
    return { blob: await canvasToJpeg(c, 0.88), contentType: "image/jpeg", width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Reads a video's size and duration, and grabs a JPEG thumbnail from its first second. */
export async function inspectVideo(file: File): Promise<{ width: number; height: number; durationS: number; thumb: Prepared | null }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("unreadable video"));
    });
    const info = { width: video.videoWidth || 720, height: video.videoHeight || 1280, durationS: Math.max(1, Math.round(video.duration || 1)) };
    let thumb: Prepared | null = null;
    try {
      video.currentTime = Math.min(1, video.duration / 2 || 0);
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
        setTimeout(resolve, 3000);
      });
      const scale = Math.min(1, 720 / Math.max(info.width, info.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(info.width * scale);
      canvas.height = Math.round(info.height * scale);
      canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
      thumb = { blob: await canvasToJpeg(canvas, 0.8), contentType: "image/jpeg", width: canvas.width, height: canvas.height };
    } catch {
      thumb = null;
    }
    return { ...info, thumb };
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Status = { id: string; size: number; received: number };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Uploads in chunks. On a dropped connection it waits (1s, 2s, 4s… up to 15s), asks the server
 * how much arrived, and resumes from there. Returns the upload id.
 */
export async function uploadResumable(
  blob: Blob,
  contentType: string,
  onProgress: (sent: number, total: number) => void,
  onRetry: () => void,
): Promise<string> {
  const start = await fetch("/api/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType, size: blob.size }),
  });
  const json = await start.json();
  if (!start.ok) throw Object.assign(new Error(json.error?.code ?? "generic"), { code: json.error?.code ?? "generic" });
  const { id, chunkBytes } = json.data as { id: string; chunkBytes: number };
  let offset = 0;
  let failures = 0;
  while (offset < blob.size) {
    try {
      const res = await fetch(`/api/uploads/${id}`, {
        method: "PUT",
        headers: { "x-offset": String(offset), "Content-Type": "application/octet-stream" },
        body: blob.slice(offset, offset + chunkBytes),
      });
      if (!res.ok && res.status < 500) {
        const err = await res.json().catch(() => ({}));
        throw Object.assign(new Error("rejected"), { code: err.error?.code ?? "generic", fatal: true });
      }
      if (!res.ok) throw new Error(`server ${res.status}`);
      const s = (await res.json()).data as Status;
      offset = s.received;
      failures = 0;
      onProgress(offset, blob.size);
    } catch (e) {
      if ((e as { fatal?: boolean }).fatal) throw e;
      failures += 1;
      if (failures > 12) throw Object.assign(new Error("network"), { code: "generic" });
      onRetry();
      await sleep(Math.min(15_000, 1000 * 2 ** (failures - 1)));
      const s = await fetch(`/api/uploads/${id}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (s?.data) offset = (s.data as Status).received;
    }
  }
  return id;
}
