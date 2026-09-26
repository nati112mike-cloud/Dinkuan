import { acceptLegal, setBirthDate } from "@dinkuan/core/server";
import { prisma } from "@dinkuan/db";
import { acceptGuidelines, hasAcceptedGuidelines } from "@dinkuan/moderation";
import { cookies } from "next/headers";
import { z } from "zod";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentUser, LANG_COOKIE } from "@/lib/session";

/**
 * Update name and language. Language also works logged out (cookie only).
 * Finishing sign-up (setting a name the first time) needs the terms, privacy policy and community
 * guidelines accepted (PRD 3, F22-AC1); each acceptance is logged as a consent. It also needs a
 * birth date (F22-AC8): under 13 is refused and signed out. Members who signed up before birth
 * dates were asked add one once, from settings.
 */
export async function POST(req: Request) {
  try {
    const body = await parseJson(
      req,
      z.object({
        name: z.string().trim().min(1).max(80).optional(),
        lang: z.enum(["am", "en"]).optional(),
        acceptGuidelines: z.literal(true).optional(),
        birthDate: z.string().optional(),
      }),
    );
    if (body.lang) {
      (await cookies()).set(LANG_COOKIE, body.lang, { path: "/", maxAge: 365 * 86400, sameSite: "lax" });
    }
    const user = await currentUser();
    if (!user) return body.name || body.birthDate ? fail("UNAUTHENTICATED") : ok({ ok: true });
    const finishingSignUp = !!body.name && !user.name;
    if (finishingSignUp && !user.birthDate && !body.birthDate) return fail("VALIDATION", "Enter your birth date");
    if (body.birthDate && !user.birthDate) await setBirthDate(user.id, body.birthDate);
    if (body.acceptGuidelines) {
      await acceptGuidelines(user.id);
      await acceptLegal(user.id);
    }
    else if (body.name && !user.name && !(await hasAcceptedGuidelines(user.id))) return fail("VALIDATION", "Accept the community guidelines first");
    await prisma.user.update({ where: { id: user.id }, data: { name: body.name, lang: body.lang } });
    if (body.name) {
      // Tickets carry the holder's name for the gate; fill it in on tickets issued before the name was set.
      await prisma.ticket.updateMany({ where: { holderUserId: user.id, holderName: "Guest" }, data: { holderName: body.name } });
    }
    return ok({ ok: true });
  } catch (e) {
    return handleError(e, req);
  }
}
