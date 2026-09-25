"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { translator, type Lang } from "@dinkuan/i18n";
import { api, errorText, loginUrl } from "@/lib/client";

/** F14-AC4: follow / unfollow; private accounts show "Requested" until approved. */
export function FollowButton({
  lang,
  userId,
  initial,
  followsYou = false,
  loggedIn,
  small = false,
}: {
  lang: Lang;
  userId: string;
  initial: "none" | "requested" | "active";
  followsYou?: boolean;
  loggedIn: boolean;
  small?: boolean;
}) {
  const t = translator(lang);
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label =
    state === "active" ? t("profile.following") : state === "requested" ? t("profile.requested") : followsYou ? t("profile.followBack") : t("profile.follow");
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={busy}
        aria-pressed={state !== "none"}
        className={`tap rounded-full font-semibold ${small ? "px-4 text-sm" : "px-6"} ${
          state === "none" ? "bg-tent-600 text-white" : "bg-white text-ink ring-1 ring-tent-200"
        }`}
        onClick={async () => {
          if (!loggedIn) return router.push(loginUrl());
          setBusy(true);
          const r = await api<{ status: "active" | "requested" | "none" }>(`/api/users/${userId}/follow`, {
            method: state === "none" ? "POST" : "DELETE",
            ...(state === "none" ? { body: {} } : {}),
          });
          setBusy(false);
          if (r.ok) {
            setState(r.data.status);
            setError(null);
            router.refresh();
          } else setError(errorText(lang, r.code));
        }}
      >
        {label}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
