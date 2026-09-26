import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getVendor } from "@dinkuan/marketplace";
import { VendorForm } from "@/components/VendorForm";
import { currentUser, getT } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pro profile" };

export default async function VendorProfilePage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/vendor/profile");
  const vendor = await getVendor(user.id);
  if (!vendor) redirect("/vendor");
  const { lang, t } = await getT();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">{t("vendor.dash.profile")}</h1>
      <VendorForm
        lang={lang}
        initial={{
          types: vendor.types,
          headline: vendor.headline,
          about: vendor.about ?? "",
          yearsExperience: vendor.yearsExperience,
          services: vendor.services,
          genres: vendor.genres,
          languages: vendor.languages,
          areas: vendor.areas,
          equipment: vendor.equipment,
          teamSize: vendor.teamSize,
          socialLinks: vendor.socialLinks,
          coverUrl: vendor.coverUrl,
        }}
      />
    </div>
  );
}
