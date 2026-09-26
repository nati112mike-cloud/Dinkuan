import type { Metadata } from "next";
import type { MessageKey } from "@dinkuan/i18n";
import { getT } from "@/lib/session";

export const metadata: Metadata = { title: "Community guidelines" };

const RULES = ["r1", "r2", "r3", "r4", "r5", "r6", "r7"] as const;
const ENFORCEMENT = ["e1", "e2", "e3"] as const;

/** F22-AC1: the community guidelines people accept at sign-up, in Amharic and English. */
export default async function GuidelinesPage() {
  const { t } = await getT();
  return (
    <article className="space-y-4">
      <h1 className="text-2xl font-extrabold">{t("guidelines.title")}</h1>
      <p className="text-stone-700">{t("guidelines.intro")}</p>
      <ol className="list-inside list-decimal space-y-2 rounded-2xl bg-white p-4 ring-1 ring-tent-100">
        {RULES.map((r) => (
          <li key={r}>{t(`guidelines.${r}` as MessageKey)}</li>
        ))}
      </ol>
      <h2 className="text-lg font-bold">{t("guidelines.enforcement")}</h2>
      <ul className="list-inside list-disc space-y-2 text-stone-700">
        {ENFORCEMENT.map((r) => (
          <li key={r}>{t(`guidelines.${r}` as MessageKey)}</li>
        ))}
      </ul>
    </article>
  );
}
