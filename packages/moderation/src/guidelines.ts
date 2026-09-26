import { prisma } from "@dinkuan/db";

/** F22-AC1: the version of the community guidelines people accept at sign-up. */
export const GUIDELINES_CONSENT = "guidelines:v1";

export async function hasAcceptedGuidelines(userId: string) {
  return (await prisma.consent.count({ where: { userId, type: GUIDELINES_CONSENT, granted: true } })) > 0;
}

/** Logs the acceptance as a consent record (CLAUDE.md rule 12). Accepting twice is harmless. */
export async function acceptGuidelines(userId: string) {
  if (await hasAcceptedGuidelines(userId)) return;
  await prisma.consent.create({ data: { userId, type: GUIDELINES_CONSENT, granted: true } });
}
