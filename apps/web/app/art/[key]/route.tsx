import { ImageResponse } from "next/og";

/**
 * Demo artwork for seeded photo posts until real Addis photos are added: a gradient card with a
 * short line of text. /art/<key>?t=Text&p=<palette 0-7>&s=square|portrait
 */
const PALETTES = [
  ["#e0873a", "#843912"],
  ["#0f766e", "#134e4a"],
  ["#7c3aed", "#312e81"],
  ["#db2777", "#831843"],
  ["#ca8a04", "#713f12"],
  ["#2563eb", "#1e3a8a"],
  ["#16a34a", "#14532d"],
  ["#475569", "#0f172a"],
] as const;

export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const url = new URL(req.url);
  const text = (url.searchParams.get("t") ?? "").slice(0, 60);
  const palette = PALETTES[Number(url.searchParams.get("p") ?? 0) % PALETTES.length]!;
  const portrait = url.searchParams.get("s") === "portrait";
  const width = 1080;
  const height = portrait ? 1350 : 1080;
  const seed = [...key].reduce((a, c) => a + c.charCodeAt(0), 0);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "flex-end",
          padding: 80,
          background: `radial-gradient(circle at ${20 + (seed % 60)}% ${15 + (seed % 40)}%, ${palette[0]} 0%, ${palette[1]} 75%)`,
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 30, letterSpacing: 6, opacity: 0.75 }}>ADDIS ABABA</div>
          <div style={{ display: "flex", fontSize: 96, fontWeight: 800, lineHeight: 1.05 }}>{text}</div>
        </div>
      </div>
    ),
    { width, height, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
