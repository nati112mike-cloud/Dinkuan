"use client";

import Link from "next/link";
import { translator, type Lang, type MessageKey } from "@dinkuan/i18n";
import { Avatar } from "./Avatar";
import { FollowButton } from "./FollowButton";
import type { PersonRow } from "./PeopleList";

/** People rows rendered in the browser (onboarding), everyone logged in. */
export function PeopleListClient({ lang, people }: { lang: Lang; people: PersonRow[] }) {
  const t = translator(lang);
  return (
    <ul className="space-y-2">
      {people.map(({ profile, reason }) => (
        <li key={profile.userId} className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-tent-100" data-testid="person">
          <Link href={`/u/${profile.username}`} className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar profile={profile} size={44} />
            <span className="min-w-0">
              <span className="block truncate font-bold">{profile.displayName}</span>
              <span className="block truncate text-sm text-stone-500">@{profile.username}</span>
              {reason && <span className="block truncate text-xs text-tent-600">{t(`people.reason.${reason}` as MessageKey)}</span>}
            </span>
          </Link>
          <FollowButton lang={lang} userId={profile.userId} initial="none" loggedIn small />
        </li>
      ))}
    </ul>
  );
}
