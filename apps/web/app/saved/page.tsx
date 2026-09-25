import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { savedPosts } from "@dinkuan/social";
import { currentUser, getT } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Saved" };

/** F16-AC5: saved posts in private collections. */
export default async function SavedPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/saved");
  const { c } = await searchParams;
  const { t } = await getT();
  const { rows, collections } = await savedPosts(user.id);
  const shown = c ? rows.filter((r) => r.collection === c) : rows;
  const chip = (label: string, href: string, active: boolean) => (
    <Link key={href} href={href} className={`tap grid place-items-center rounded-full px-4 text-sm font-semibold ring-1 ${active ? "bg-tent-600 text-white ring-tent-600" : "bg-white ring-tent-200"}`}>
      {label}
    </Link>
  );
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">{t("settings.savedPosts")}</h1>
      <div className="flex flex-wrap gap-2">
        {chip(t("post.saved"), "/saved", !c)}
        {collections.map((name) => chip(name, `/saved?c=${encodeURIComponent(name)}`, c === name))}
      </div>
      {shown.length === 0 ? (
        <p className="text-stone-500">{t("home.empty")}</p>
      ) : (
        <div className="-mx-4 grid grid-cols-3 gap-0.5 sm:mx-0">
          {shown.map(({ post }) => {
            const m = post.media[0];
            const img = m ? (m.kind === "image" ? m.url : m.thumbUrl) : null;
            return (
              <Link key={post.id} href={m?.kind === "video" ? `/reels?start=${post.id}` : `/p/${post.id}`} className="aspect-square overflow-hidden bg-tent-100">
                {img ? <img src={img} alt="" className="h-full w-full object-cover" /> : <span className="line-clamp-5 block p-2 text-xs font-semibold">{post.caption}</span>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
