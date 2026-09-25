import "server-only";
import { cookies, headers } from "next/headers";
import { userForSession } from "@dinkuan/core/server";
import { DEFAULT_LANG, isLang, translator, type Lang } from "@dinkuan/i18n";

export const SESSION_COOKIE = "dk_session";
export const LANG_COOKIE = "dk_lang";

/** Current user from the session cookie, or from a Bearer token (scanner app). */
export async function currentUser() {
  const auth = (await headers()).get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const token = bearer ?? (await cookies()).get(SESSION_COOKIE)?.value;
  return userForSession(token);
}

export async function currentLang(): Promise<Lang> {
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  if (isLang(c)) return c;
  const user = await currentUser();
  return user?.lang ?? DEFAULT_LANG;
}

export async function getT() {
  const lang = await currentLang();
  return { lang, t: translator(lang) };
}
