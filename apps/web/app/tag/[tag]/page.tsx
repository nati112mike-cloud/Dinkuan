import type { Metadata } from "next";
import { hashtagPosts } from "@dinkuan/social";
import { Feed } from "@/components/Feed";
import { currentUser, getT } from "@/lib/session";
import { toPostDTO } from "@/lib/social";

export const dynamic = "force-dynamic";

type Params = Promise<{ tag: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return { title: `#${decodeURIComponent((await params).tag)}` };
}

export default async function TagPage({ params }: { params: Params }) {
  const tag = decodeURIComponent((await params).tag).toLowerCase();
  const user = await currentUser();
  const { lang, t } = await getT();
  const page = await hashtagPosts(tag, user?.id ?? null, null, 20);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-tent-700">{t("tag.title", { tag })}</h1>
      <Feed
        initial={{ items: page.items.map((p) => toPostDTO(p, user?.id ?? null, lang)), nextCursor: null }}
        endpoint="/api/feed"
        lang={lang}
        loggedIn={!!user}
      />
    </div>
  );
}
