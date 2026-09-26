import { translator, type Lang } from "@dinkuan/i18n";

/** F3: details → tickets → review, so the organiser knows where they are. */
export function WizardSteps({ lang, step }: { lang: Lang; step: 1 | 2 | 3 }) {
  const t = translator(lang);
  const steps = [t("wizard.details"), t("wizard.tickets"), t("wizard.review")];
  return (
    <ol className="flex gap-2 text-xs font-semibold">
      {steps.map((s, i) => (
        <li key={s} aria-current={i + 1 === step ? "step" : undefined} className={`flex-1 rounded-full px-2 py-1 text-center ${i + 1 <= step ? "bg-tent-600 text-white" : "bg-tent-100 text-tent-800"}`}>
          {i + 1}. {s}
        </li>
      ))}
    </ol>
  );
}
