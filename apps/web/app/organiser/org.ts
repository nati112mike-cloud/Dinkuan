import "server-only";
import { myOrganisers } from "@dinkuan/core/server";

/** The organiser a page works on: `?org=` when the person has several, else their newest. */
export async function pickOrganiser(userId: string, orgParam?: string) {
  const orgs = await myOrganisers(userId);
  return { orgs, org: orgs.find((o) => o.id === orgParam) ?? orgs[0] ?? null };
}
