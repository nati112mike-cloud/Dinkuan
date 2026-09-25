import type { Metadata } from "next";
import { reelsFeed } from "@dinkuan/social";
import { ReelsPlayer } from "@/components/ReelsPlayer";
import { getT } from "@/lib/session";
import { currentMember, toPostDTO } from "@/lib/social";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reels" };

export default async function ReelsPage({ searchParams }: { searchParams: Promise<{ start?: string }> }) {
  const { start } = await searchParams;
  const { lang } = await getT();
  const me = await currentMember();
  const viewer = me?.user.id ?? null;
  const page = await reelsFeed(viewer, null, 6, start);
  return (
    <ReelsPlayer
      initial={{ items: page.items.map((p) => toPostDTO(p, viewer, lang)), nextCursor: page.nextCursor }}
      lang={lang}
      loggedIn={!!me}
      lowData={me?.profile.lowDataMode ?? false}
    />
  );
}
