import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { pendingGigs } from "@dinkuan/marketplace";
import { ActionButton } from "@/components/ActionButton";
import { eventTitle } from "@/lib/format";
import { currentUser, getT } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gig confirmations" };

/** F20-AC2: organisers confirm that a vendor worked their event, which verifies the gig. */
export default async function GigsPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/vendor/gigs");
  const { lang, t } = await getT();
  const gigs = await pendingGigs(user.id);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">{t("gigs.pending")}</h1>
      {gigs.length === 0 && <p className="text-stone-500">{t("gigs.none")}</p>}
      <ul className="space-y-3">
        {gigs.map((g) => {
          const profile = g.vendor.user.profile;
          return (
            <li key={g.id} className="space-y-3 rounded-2xl bg-white p-3 ring-1 ring-tent-100">
              <p className="text-sm">
                {t("gigs.claim", {
                  name: profile?.displayName || profile?.username || "",
                  event: g.event ? eventTitle(g.event, lang) : "",
                })}
              </p>
              {profile && (
                <Link href={`/hire/v/${profile.username}`} className="text-sm font-semibold text-tent-700">
                  @{profile.username}
                </Link>
              )}
              <div className="grid grid-cols-4 gap-1">
                {g.items.map((i) => (
                  <img key={i.id} src={i.thumbUrl ?? i.url} alt="" className="aspect-square w-full rounded-lg object-cover" />
                ))}
              </div>
              <div className="flex gap-2">
                <ActionButton lang={lang} url={`/api/gigs/${g.id}`} body={{ approve: true }} label="gigs.confirm" />
                <ActionButton lang={lang} url={`/api/gigs/${g.id}`} body={{ approve: false }} label="gigs.decline" tone="quiet" />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
