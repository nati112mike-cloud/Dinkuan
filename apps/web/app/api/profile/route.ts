import { profileInput, setInterests, updateProfile } from "@dinkuan/social";
import { z } from "zod";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentMember, toProfileDTO } from "@/lib/social";

/** F14-AC1: edit my profile; F17-AC1: my interests. */
export async function PATCH(req: Request) {
  try {
    const me = await currentMember();
    if (!me) return fail("UNAUTHENTICATED");
    const input = await parseJson(req, profileInput.extend({ interests: z.array(z.string()).max(20).optional() }));
    const { interests, ...rest } = input;
    const profile = await updateProfile(me.user.id, rest);
    if (interests) await setInterests(me.user.id, interests);
    return ok(toProfileDTO(profile));
  } catch (e) {
    return handleError(e, req);
  }
}
