import { useState } from "react";
import { api, setToken } from "../api";
import { tr, type Lang } from "../i18n";

export function Login({ lang, onDone }: { lang: Lang; onDone: () => void }) {
  const t = tr(lang);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = "min-h-12 w-full rounded-xl bg-white px-4 text-lg text-black";
  const btn = "min-h-12 w-full rounded-xl bg-tent-600 text-lg font-bold disabled:opacity-40";
  return (
    <form
      className="space-y-3 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          if (!sent) {
            const r = await api<{ phone: string }>("/api/auth/otp/request", { method: "POST", body: { phone } });
            setSent(r.phone);
          } else {
            const r = await api<{ token: string }>("/api/auth/otp/verify", {
              method: "POST",
              body: { phone: sent, code, client: "scanner" },
            });
            setToken(r.token);
            onDone();
          }
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <label className="block space-y-1">
        <span className="text-sm">{t("phone")}</span>
        <input className={input} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!!sent} />
      </label>
      {sent && (
        <>
          <p className="rounded-lg bg-amber-200 p-2 text-sm font-semibold text-amber-950">{t("demoCode")}</p>
          <label className="block space-y-1">
            <span className="text-sm">{t("code")}</span>
            <input className={input} inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          </label>
        </>
      )}
      <button className={btn} disabled={sent ? code.length !== 6 : phone.length < 9}>
        {sent ? t("login") : t("sendCode")}
      </button>
      {error && <p className="text-red-400">{error}</p>}
    </form>
  );
}
