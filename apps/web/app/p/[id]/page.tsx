import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPost } from "@dinkuan/social";
import { Comments } from "@/components/Comments";
import { PostCard } from "@/components/PostCard";
import { currentUser, getT } from "@/lib/session";
import { toPostDTO } from "@/lib/social";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const post = await getPost(id, null).catch(() => null);
  if (!post) return {};
  const name = post.author.profile?.displayName || post.author.profile?.username || "";
  const description = post.caption.slice(0, 160);
  const image = post.media[0]?.kind === "image" ? post.media[0].url : post.media[0]?.thumbUrl;
  return {
    title: name,
    description,
    openGraph: { title: name, description, type: "article", ...(image ? { images: [image] } : {}) },
  };
}

export default async function PostPage({ params }: { params: Params }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await currentUser();
  const post = await getPost(id, user?.id ?? null);
  if (!post) notFound();
  const { lang } = await getT();
  return (
    <div className="space-y-6">
      <PostCard post={toPostDTO(post, user?.id ?? null, lang)} lang={lang} loggedIn={!!user} detail />
      <Comments postId={post.id} postAuthorId={post.authorId} lang={lang} viewerId={user?.id ?? null} />
    </div>
  );
}
