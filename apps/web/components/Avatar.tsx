import type { ProfileDTO } from "@/lib/social-types";

const COLORS = ["bg-tent-500", "bg-emerald-600", "bg-sky-600", "bg-violet-600", "bg-rose-600", "bg-amber-600"];

export function Avatar({ profile, size = 40 }: { profile: Pick<ProfileDTO, "displayName" | "username" | "avatarUrl">; size?: number }) {
  const style = { width: size, height: size };
  if (profile.avatarUrl) {
    return <img src={profile.avatarUrl} alt="" style={style} className="shrink-0 rounded-full object-cover ring-1 ring-tent-100" />;
  }
  const name = profile.displayName || profile.username;
  const color = COLORS[[...profile.username].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
  return (
    <span
      style={{ ...style, fontSize: size * 0.42 }}
      className={`grid shrink-0 place-items-center rounded-full font-bold text-white ${color}`}
      aria-hidden
    >
      {[...name][0]?.toUpperCase()}
    </span>
  );
}
