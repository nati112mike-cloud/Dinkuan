"use client";

import { useEffect, useState } from "react";
import { translator, type Lang, type MessageKey } from "@dinkuan/i18n";
import { INTERESTS } from "@dinkuan/social/text";
import { api, errorText } from "@/lib/client";
import { PeopleListClient } from "./PeopleListClient";
import type { PersonRow } from "./PeopleList";

/** F17-AC1: onboarding: username → interests → at least 10 people to follow. */
export function Welcome({ lang, username, next }: { lang: Lang; username: string; next: string }) {
  const t = translator(lang);
  const [step, setStep] = useState<"username" | "interests" | "follow">("username");
  const [name, setName] = useState(username);
  const [picked, setPicked] = useState<string[]>([]);
  const [people, setPeople] = useState<PersonRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (step !== "follow") return;
    void api<PersonRow[]>("/api/people").then((r) => r.ok && setPeople(r.data));
  }, [step]);

  const finish = async () => {
    await api("/api/profile", { method: "PATCH", body: { onboarded: true } });
    window.location.href = next;
  };
  const button = "tap w-full rounded-2xl bg-tent-600 py-3 text-lg font-bold text-white disabled:opacity-50";

  return (
    <div className="mx-auto max-w-md space-y-5 py-4">
      <h1 className="text-2xl font-extrabold">{t("welcome.title")}</h1>
      {step === "username" && (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await api("/api/profile", { method: "PATCH", body: { username: name } });
            if (r.ok) {
              setError(null);
              setStep("interests");
            } else setError(errorText(lang, r.code));
          }}
        >
          <label className="block space-y-1 font-semibold">
            {t("welcome.pickUsername")}
            <span className="flex items-center rounded-2xl border border-tent-200 bg-white px-3">
              <span className="text-stone-400">@</span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoCapitalize="none" className="tap w-full px-1 text-lg outline-none" />
            </span>
            <span className="block text-xs font-normal text-stone-500">{t("settings.usernameHint")}</span>
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className={button}>{t("welcome.next")}</button>
        </form>
      )}
      {step === "interests" && (
        <div className="space-y-4">
          <h2 className="font-bold">{t("welcome.interests")}</h2>
          <div className="flex flex-wrap gap-2">
            {INTERESTS.map((k) => {
              const on = picked.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked((p) => (on ? p.filter((x) => x !== k) : [...p, k]))}
                  className={`tap rounded-full px-5 font-semibold ring-1 ${on ? "bg-tent-600 text-white ring-tent-600" : "bg-white ring-tent-200"}`}
                >
                  {t(`interest.${k}` as MessageKey)}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className={button}
            onClick={async () => {
              await api("/api/profile", { method: "PATCH", body: { interests: picked } });
              setStep("follow");
            }}
          >
            {t("welcome.next")}
          </button>
        </div>
      )}
      {step === "follow" && (
        <div className="space-y-4">
          <h2 className="font-bold">{t("welcome.follow")}</h2>
          {people ? <PeopleListClient lang={lang} people={people} /> : <p className="text-stone-400">…</p>}
          <button type="button" className={button} onClick={() => void finish()}>
            {t("welcome.done")}
          </button>
        </div>
      )}
      {step !== "follow" && (
        <button type="button" onClick={() => void finish()} className="block w-full text-center text-sm font-semibold text-stone-500">
          {t("welcome.skip")}
        </button>
      )}
    </div>
  );
}
