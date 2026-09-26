"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { translator, type Lang } from "@dinkuan/i18n";
import { MAX_COMPARE } from "@dinkuan/marketplace/text";

type Item = { id: string; name: string };
const KEY = "dk_compare";
const EVENT = "dk-compare";

function read(): Item[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Item[];
  } catch {
    return [];
  }
}

function write(items: Item[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // storage blocked: comparing still works within the page
  }
  window.dispatchEvent(new Event(EVENT));
}

function useCompare() {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    const sync = () => setItems(read());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return items;
}

/** F20-AC12: pick up to three vendors to compare. The list lives on the phone. */
export function CompareToggle({ lang, vendor }: { lang: Lang; vendor: Item }) {
  const t = translator(lang);
  const items = useCompare();
  const on = items.some((i) => i.id === vendor.id);
  const full = !on && items.length >= MAX_COMPARE;
  return (
    <button
      type="button"
      disabled={full}
      aria-pressed={on}
      onClick={() => write(on ? items.filter((i) => i.id !== vendor.id) : [...items, vendor])}
      className={`tap flex-1 whitespace-nowrap border-l border-tent-100 px-3 text-sm font-semibold disabled:opacity-40 ${on ? "text-tent-700" : "text-stone-600"}`}
    >
      {on ? "☑" : "☐"} {t("hire.compare")}
    </button>
  );
}

/** `raised` stacks it above a page's own bottom action bar (the pro profile's Request button). */
export function CompareBar({ lang, raised = false }: { lang: Lang; raised?: boolean }) {
  const t = translator(lang);
  const items = useCompare();
  if (items.length === 0) return null;
  return (
    <div className={`fixed inset-x-0 z-20 px-4 ${raised ? "bottom-[152px]" : "bottom-[64px]"}`}>
      <div className="mx-auto flex max-w-2xl items-center gap-2 rounded-2xl bg-ink p-2 pl-4 text-sm text-white shadow-lg">
        <span className="min-w-0 flex-1 truncate">
          {t("hire.compareCount", { n: items.length, max: MAX_COMPARE })} · {items.map((i) => i.name).join(", ")}
        </span>
        <button type="button" onClick={() => write([])} className="tap px-2 text-stone-300" aria-label={t("hire.clear")}>
          ✕
        </button>
        <Link
          href={`/hire/compare?ids=${items.map((i) => i.id).join(",")}`}
          aria-disabled={items.length < 2}
          className={`tap grid place-items-center rounded-xl px-4 font-bold ${items.length < 2 ? "pointer-events-none bg-white/20" : "bg-tent-500"}`}
        >
          {t("hire.compareNow")}
        </Link>
      </div>
    </div>
  );
}
