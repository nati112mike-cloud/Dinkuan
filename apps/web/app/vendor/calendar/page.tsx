import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { addisToday, getVendor, unavailableDates } from "@dinkuan/marketplace";
import { CalendarEditor } from "@/components/CalendarEditor";
import { currentUser, getT } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Calendar" };

/** F20-AC5: block dates; booked dates block automatically. */
export default async function VendorCalendarPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/vendor/calendar");
  if (!(await getVendor(user.id))) redirect("/vendor");
  const { lang, t } = await getT();
  const today = addisToday();
  const off = await unavailableDates(user.id, today, new Date(Date.now() + 100 * 86_400_000).toISOString().slice(0, 10));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">{t("vendor.dash.calendar")}</h1>
      <p className="text-sm text-stone-600">{t("calendar.hint")}</p>
      <CalendarEditor lang={lang} today={today} initial={off} />
    </div>
  );
}
