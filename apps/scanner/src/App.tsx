import { useEffect, useState } from "react";
import { api, getToken, setToken } from "./api";
import { db } from "./db";
import { tr, type Lang } from "./i18n";
import { Login } from "./screens/Login";
import { EventPicker } from "./screens/EventPicker";
import { Gate } from "./screens/Gate";

export function App() {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem("dk_scanner_lang") as Lang) ?? "am");
  const [loggedIn, setLoggedIn] = useState(!!getToken());
  const [eventId, setEventId] = useState<string | null>(() => localStorage.getItem("dk_scanner_event"));
  const t = tr(lang);

  useEffect(() => {
    localStorage.setItem("dk_scanner_lang", lang);
  }, [lang]);

  function chooseEvent(id: string | null) {
    setEventId(id);
    if (id) localStorage.setItem("dk_scanner_event", id);
    else localStorage.removeItem("dk_scanner_event");
  }

  async function logout() {
    await db.delete();
    setToken(null);
    localStorage.removeItem("dk_scanner_event");
    window.location.reload();
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="flex items-center justify-between px-4 py-3">
        <p className="font-bold">
          <span className="text-tent-500">ድንኳን</span> · {t("title")}
        </p>
        <button className="min-h-11 rounded-full border border-white/30 px-3 text-sm" onClick={() => setLang(lang === "am" ? "en" : "am")}>
          {lang === "am" ? "EN" : "አማ"}
        </button>
      </header>
      {!loggedIn ? (
        <Login lang={lang} onDone={() => setLoggedIn(true)} />
      ) : !eventId ? (
        <EventPicker lang={lang} onPick={chooseEvent} onLogout={logout} />
      ) : (
        <Gate lang={lang} eventId={eventId} onChangeEvent={() => chooseEvent(null)} />
      )}
    </div>
  );
}

export { api };
