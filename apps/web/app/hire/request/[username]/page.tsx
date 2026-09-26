import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { addisToday, getVendorByUsername, listPackages, unavailableDates } from "@dinkuan/marketplace";
import { Avatar } from "@/components/Avatar";
import { RequestForm } from "@/components/RequestForm";
import { currentUser, getT } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Request" };

type Props = { params: Promise<{ username: string }>; searchParams: Promise<{ date?: string; package?: string }> };

/** F20-AC14: the booking request form. */
export default async function RequestPage({ params, searchParams }: Props) {
  const { username } = await params;
  const sp = await searchParams;
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/hire/request/${username}`)}`);
  const found = await getVendorByUsername(username);
  if (!found || found.vendor.userId === user.id) notFound();
  const { lang, t } = await getT();
  const today = addisToday();
  const [packages, off] = await Promise.all([
    listPackages(found.vendor.userId),
    unavailableDates(found.vendor.userId, today, new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10)),
  ]);
  const name = found.profile.displayName || found.profile.username;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Avatar profile={{ ...found.profile, displayName: name }} size={48} />
        <div>
          <h1 className="text-xl font-extrabold">{t("request.title", { name })}</h1>
          <p className="text-sm text-stone-500">{found.vendor.headline}</p>
        </div>
      </div>
      <RequestForm
        lang={lang}
        vendorId={found.vendor.userId}
        today={today}
        unavailable={off.map((o) => o.date)}
        packages={packages.map((p) => ({ id: p.id, tier: p.tier, name: p.name, priceSantim: p.priceSantim }))}
        initialDate={sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : ""}
        initialPackage={packages.some((p) => p.id === sp.package) ? sp.package! : ""}
      />
    </div>
  );
}
