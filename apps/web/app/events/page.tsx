import { EventCard } from "@/components/EventCard";
import { EventsDiscovery } from "@/components/EventsDiscovery";
import { CATEGORIES, findEvents } from "@/lib/events";
import { getT } from "@/lib/session";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | undefined>>;

export default async function EventsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { lang, t } = await getT();
  // No search or filters: show the discovery rows (Featured, Tonight, This weekend…).
  if (!sp.q && !sp.date && !sp.pick && !sp.category && !sp.price) return <EventsDiscovery lang={lang} />;
  const events = await findEvents({ q: sp.q, date: sp.pick ? "date" : sp.date, pick: sp.pick, category: sp.category, price: sp.price });
  const select = "tap w-full rounded-xl border border-tent-200 bg-white px-3 text-sm";
  return (
    <div className="space-y-4">
      <form className="space-y-3">
        <input
          name="q"
          defaultValue={sp.q}
          placeholder={t("search.placeholder")}
          className="tap w-full rounded-2xl border border-tent-200 bg-white px-4 py-3 shadow-sm outline-none focus:border-tent-500"
        />
        <div className="grid grid-cols-3 gap-2">
          <label className="space-y-1 text-xs font-semibold text-stone-600">
            {t("filter.date")}
            <select name="date" defaultValue={sp.date ?? ""} className={select}>
              <option value="">{t("filter.any")}</option>
              <option value="today">{t("filter.today")}</option>
              <option value="weekend">{t("filter.weekend")}</option>
              <option value="week">{t("filter.week")}</option>
            </select>
          </label>
          <label className="space-y-1 text-xs font-semibold text-stone-600">
            {t("filter.category")}
            <select name="category" defaultValue={sp.category ?? ""} className={select}>
              <option value="">{t("filter.any")}</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`category.${c}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs font-semibold text-stone-600">
            {t("filter.price")}
            <select name="price" defaultValue={sp.price ?? ""} className={select}>
              <option value="">{t("filter.any")}</option>
              <option value="free">{t("filter.free")}</option>
              <option value="under500">{t("filter.under500")}</option>
              <option value="500to1500">{t("filter.500to1500")}</option>
              <option value="over1500">{t("filter.over1500")}</option>
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-stone-600">
          {t("filter.pickDate")}
          <input type="date" name="pick" defaultValue={sp.pick} className="tap rounded-xl border border-tent-200 bg-white px-3 text-sm" />
        </label>
        <button className="tap w-full rounded-xl bg-tent-600 font-semibold text-white">{t("filter.apply")}</button>
      </form>
      <p className="text-sm text-stone-500">{t("search.results", { count: events.length })}</p>
      {events.length === 0 ? (
        <p className="py-10 text-center text-stone-500">{t("search.noResults")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {events.map((e) => (
            <EventCard key={e.id} event={e} lang={lang} />
          ))}
        </div>
      )}
    </div>
  );
}
