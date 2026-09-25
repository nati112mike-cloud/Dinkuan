import { prisma } from "@dinkuan/db";
import { ImageResponse } from "next/og";
import { CATEGORY_COLORS } from "@/lib/palette";

/**
 * Generated demo poster (PNG, so Telegram/WhatsApp previews work).
 * ?size=card (600x750), share (1080x1080) or story (1080x1920); default 1080x1350.
 */
const SIZES = { card: [600, 750], share: [1080, 1080], story: [1080, 1920], poster: [1080, 1350] } as const;

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sizeKey = (new URL(req.url).searchParams.get("size") ?? "poster") as keyof typeof SIZES;
  const [width, height] = SIZES[sizeKey] ?? SIZES.poster;
  const event = await prisma.event.findUnique({ where: { slug }, include: { venue: true } });
  if (!event) return new Response("Not found", { status: 404 });
  const [from, to] = CATEGORY_COLORS[event.category];
  const scale = width / 1080;
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Addis_Ababa",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(event.startsAt);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80 * scale,
          background: `linear-gradient(160deg, ${from} 0%, ${to} 100%)`,
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 34 * scale, letterSpacing: 6 * scale, opacity: 0.85 }}>
          {`DINKUAN · ${event.category.replace("_", " & ").toUpperCase()}`}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 120 * scale, fontWeight: 800, lineHeight: 1.02 }}>{event.titleEn ?? ""}</div>
          {event.lineup.length > 0 && (
            <div style={{ display: "flex", fontSize: 42 * scale, marginTop: 36 * scale, opacity: 0.9 }}>{event.lineup.join(" · ")}</div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 44 * scale }}>
          <div style={{ display: "flex", fontWeight: 700 }}>{date}</div>
          <div style={{ display: "flex", opacity: 0.85 }}>{`${event.venue.name}, Addis Ababa`}</div>
        </div>
      </div>
    ),
    { width, height, headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
