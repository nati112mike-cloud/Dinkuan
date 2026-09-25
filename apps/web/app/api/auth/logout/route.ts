import { logout } from "@dinkuan/core/server";
import { cookies } from "next/headers";
import { ok } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/session";

export async function POST() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await logout(token);
  jar.delete(SESSION_COOKIE);
  return ok({ ok: true });
}
