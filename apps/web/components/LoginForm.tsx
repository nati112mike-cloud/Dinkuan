"use client";

import { useState } from "react";
import { translator, type Lang, type MessageKey } from "@dinkuan/i18n";

export function LoginForm({ lang, next, demo }: { lang: Lang; next: string; demo: boolean }) {
  const t = translator(lang);
  const [step, setStep] = useState<"phone" | "code" | "name">("phone");
  const [phone, setPhone] = useState("");
  const [normalized, setNormalized] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(url: string, body: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      const key = `error.${json.error?.code}` as MessageKey;
      setError(t(key) === key ? t("error.generic") : t(key));
      return null;
    }
    return json.data;
  }

  const input = "tap w-full rounded-2xl border border-tent-200 bg-white px-4 py-3 text-lg outline-none focus:border-tent-500";
  const button = "tap w-full rounded-2xl bg-tent-600 py-3 text-lg font-bold text-white disabled:opacity-50";

  return (
    <div className="mx-auto max-w-sm space-y-5 py-6">
      <h1 className="text-2xl font-extrabold">{t("login.title")}</h1>
      {step === "phone" && (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const data = await call("/api/auth/otp/request", { phone });
            if (data) {
              setNormalized(data.phone);
              setStep("code");
            }
          }}
        >
          <label className="block space-y-1 font-semibold">
            {t("login.phone")}
            <input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("login.phoneHint")} className={input} />
          </label>
          <button disabled={busy || phone.length < 9} className={button}>
            {t("login.sendCode")}
          </button>
        </form>
      )}
      {step === "code" && (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const data = await call("/api/auth/otp/verify", { phone: normalized, code });
            if (!data) return;
            if (!data.user.name) setStep("name");
            else window.location.href = next;
          }}
        >
          <p className="text-stone-600">{t("login.codeSent", { phone: normalized })}</p>
          {demo && <p className="rounded-xl bg-amber-100 p-3 text-sm font-semibold text-amber-900">{t("login.demoCode")}</p>}
          <label className="block space-y-1 font-semibold">
            {t("login.code")}
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className={`${input} tracking-[0.4em]`} />
          </label>
          <button disabled={busy || code.length !== 6} className={button}>
            {t("login.verify")}
          </button>
        </form>
      )}
      {step === "name" && (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const data = await call("/api/me", { name, lang });
            if (data) window.location.href = next;
          }}
        >
          <label className="block space-y-1 font-semibold">
            {t("login.name")}
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={input} />
          </label>
          <button disabled={busy || name.trim().length === 0} className={button}>
            {t("login.saveName")}
          </button>
        </form>
      )}
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
    </div>
  );
}
