import Link from "next/link";
import { translator, type Lang, type MessageKey } from "@dinkuan/i18n";
import type { ProfileDTO } from "@/lib/social-types";
import { Avatar } from "./Avatar";
import { FollowButton } from "./FollowButton";

export type PersonRow = { profile: ProfileDTO; reason: string | null; following?: "none" | "requested" | "active" };

export function PeopleList({ lang, people, viewerId }: { lang: Lang; people: PersonRow[]; viewerId: string | null }) {
  const t = translator(lang);
  if (people.length === 0) return <p className="text-stone-500">{t("people.none")}</p>;
  return (
    <ul className="space-y-2">
      {people.map(({ profile, reason, following }) => (
        <li key={profile.userId} className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-tent-100" data-testid="person">
          <Link href={`/u/${profile.username}`} className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar profile={profile} size={44} />
            <span className="min-w-0">
              <span className="block truncate font-bold">
                {profile.displayName}
                {profile.isVerified && <span className="ml-1 text-sky-600">✓</span>}
              </span>
              <span className="block truncate text-sm text-stone-500">@{profile.username}</span>
              {reason && <span className="block truncate text-xs text-tent-600">{t(`people.reason.${reason}` as MessageKey)}</span>}
            </span>
          </Link>
          {viewerId !== profile.userId && (
            <FollowButton lang={lang} userId={profile.userId} initial={following ?? "none"} loggedIn={!!viewerId} small />
          )}
        </li>
      ))}
    </ul>
  );
}
