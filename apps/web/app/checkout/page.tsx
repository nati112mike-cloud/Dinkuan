import { redirect } from "next/navigation";
import { ageGroup, isAdultCategory, orderTotals } from "@dinkuan/core";
import { BirthDateForm } from "@/components/BirthDateForm";
import { CheckoutForm } from "@/components/CheckoutForm";
import { getEventBySlug } from "@/lib/events";
import { birr, eventTitle, formatDay, formatTime } from "@/lib/format";
import { currentUser, getT } from "@/lib/session";

export const dynamic = "force-dynamic";

type SP = Promise<{ event?: string; items?: string; code?: string }>;

/** F5-AC1: review (all-in price + fee breakdown) → choose method → pay. */
export default async function CheckoutPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/checkout?event=${sp.event}&items=${sp.items}${sp.code ? `&code=${sp.code}` : ""}`)}`);
  const event = sp.event ? await getEventBySlug(sp.event) : null;
  if (!event) redirect("/");
  const { lang, t } = await getT();
  const wanted = new Map(
    (sp.items ?? "")
      .split(",")
      .map((s) => s.split(":"))
      .filter(([id, q]) => id && q && /^\d+$/.test(q))
      .map(([id, q]) => [id!, Number(q)]),
  );
  const lines = event.ticketTypes
    .filter((tt) => (wanted.get(tt.id) ?? 0) > 0)
    .map((tt) => ({ id: tt.id, name: tt.name, unitPrice: tt.priceSantim, qty: wanted.get(tt.id)! }));
  if (lines.length === 0) redirect(`/e/${event.slug}`);
  const totals = orderTotals(lines, { feePctBps: event.feePctBps, feeFixedSantim: event.feeFixedSantim });
  const money = (s: number) => t("money.birr", { amount: birr(s) });
  // F22-AC8: nightlife is 18+. Ask for a missing birth date here rather than failing at pay.
  const age = isAdultCategory(event.category) ? ageGroup(user.birthDate) : "adult";

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">{t("checkout.title")}</h1>
      <div className="rounded-2xl bg-white p-4 ring-1 ring-tent-100">
        <p className="font-bold">{eventTitle(event, lang)}</p>
        <p className="text-sm text-stone-500">
          {formatDay(event.startsAt, lang)} · {formatTime(event.startsAt, lang)} · {event.venue.name}
        </p>
        <ul className="mt-3 space-y-1 text-sm">
          {lines.map((l) => (
            <li key={l.id} className="flex justify-between">
              <span>
                {l.qty} × {l.name}
              </span>
              <span>{money(l.unitPrice * l.qty)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-tent-100 pt-3 text-sm">
          <div className="flex justify-between">
            <dt>{t("checkout.subtotal")}</dt>
            <dd>{money(totals.subtotal)}</dd>
          </div>
          <div className="flex justify-between text-stone-500">
            <dt>{t("checkout.fee")}</dt>
            <dd>{money(totals.fee)}</dd>
          </div>
          <div className="flex justify-between text-base font-extrabold">
            <dt>{t("checkout.total")}</dt>
            <dd>{money(totals.total)}</dd>
          </div>
        </dl>
      </div>
      {age === "adult" ? (
        <CheckoutForm
          lang={lang}
          eventId={event.id}
          items={lines.map((l) => ({ ticketTypeId: l.id, qty: l.qty }))}
          accessCode={sp.code?.slice(0, 20) ?? null}
          total={totals.total}
        />
      ) : age === "unknown" ? (
        <div className="space-y-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200" data-testid="age-check">
          <p className="font-semibold">{t("age.confirmToBuy")}</p>
          <BirthDateForm lang={lang} />
        </div>
      ) : (
        <p className="rounded-2xl bg-red-50 p-4 font-semibold text-red-700" data-testid="age-check">
          {t("error.AGE_RESTRICTED")}
        </p>
      )}
      {age === "adult" && <p className="text-center text-xs text-stone-500">{t("checkout.reserved")}</p>}
    </div>
  );
}
