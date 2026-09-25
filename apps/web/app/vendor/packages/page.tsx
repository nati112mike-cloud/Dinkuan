import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getVendor, listPackages } from "@dinkuan/marketplace";
import { PackagesForm } from "@/components/PackagesForm";
import { currentUser, getT } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Packages" };

export default async function VendorPackagesPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/vendor/packages");
  if (!(await getVendor(user.id))) redirect("/vendor");
  const { lang, t } = await getT();
  const pkgs = await listPackages(user.id);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">{t("vendor.dash.packages")}</h1>
      <p className="text-sm text-stone-600">{t("packagesForm.hint")}</p>
      <PackagesForm
        lang={lang}
        initial={pkgs.map((p) => ({
          tier: p.tier,
          name: p.name,
          priceSantim: p.priceSantim,
          hours: p.hours,
          includes: p.includes,
          addons: p.addons.map((a) => ({ name: a.name, priceSantim: a.priceSantim })),
        }))}
      />
    </div>
  );
}
