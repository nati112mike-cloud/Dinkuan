import { ImageResponse } from "next/og";
import { getProfileView } from "@dinkuan/social";

/** F14-AC7: Open Graph card for a shared profile link (1200x630 PNG). */
export async function GET(_req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const view = await getProfileView(username, null);
  if (!view) return new Response("Not found", { status: 404 });
  const p = view.profile;
  const latinName = /^[\p{Script=Latin}\p{N}\s.'_-]+$/u.test(p.displayName) ? p.displayName : "";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #e0873a 0%, #843912 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 30, letterSpacing: 6, opacity: 0.85 }}>DINKUAN · ADDIS ABABA</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {latinName && <div style={{ display: "flex", fontSize: 96, fontWeight: 800 }}>{latinName}</div>}
          <div style={{ display: "flex", fontSize: latinName ? 48 : 96, fontWeight: latinName ? 400 : 800, opacity: 0.9 }}>{`@${p.username}`}</div>
        </div>
        <div style={{ display: "flex", fontSize: 40, gap: 48 }}>
          <div style={{ display: "flex" }}>{`${p.followersCount} followers`}</div>
          <div style={{ display: "flex" }}>{`${p.postsCount} posts`}</div>
          <div style={{ display: "flex" }}>{`${p.likesReceived} likes`}</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
