import Link from "next/link";
import type { PostDTO } from "@/lib/social-types";

/** Profile grid: square tiles for photos, videos and text posts. */
export function PostGrid({ posts }: { posts: PostDTO[] }) {
  return (
    <div className="-mx-4 grid grid-cols-3 gap-0.5 sm:mx-0">
      {posts.map((p) => {
        const m = p.media[0];
        const img = m ? (m.kind === "image" ? m.url : m.thumbUrl) : null;
        return (
          <Link key={p.id} href={m?.kind === "video" ? `/reels?start=${p.id}` : `/p/${p.id}`} className="relative aspect-square overflow-hidden bg-tent-100" data-testid="grid-post">
            {img ? (
              <img src={img} alt="" loading="lazy" className="h-full w-full object-cover" />
            ) : m?.kind === "video" ? (
              <video src={m.url} muted preload="metadata" className="h-full w-full object-cover" />
            ) : (
              <span className="line-clamp-5 block p-2 text-xs font-semibold leading-snug text-tent-900">{p.caption}</span>
            )}
            {m?.kind === "video" && <span className="absolute bottom-1 left-1 text-xs font-bold text-white drop-shadow">▶ {p.viewCount}</span>}
            {p.media.length > 1 && <span className="absolute right-1 top-1 text-xs text-white drop-shadow">❐</span>}
          </Link>
        );
      })}
    </div>
  );
}
