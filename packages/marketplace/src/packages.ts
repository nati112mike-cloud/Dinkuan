import { DomainError } from "@dinkuan/core";
import { prisma } from "@dinkuan/db";
import { z } from "zod";
import { TIERS } from "./text";
import { assertVendor, refreshVendorStats } from "./vendors";

const santim = z.number().int().min(0).max(100_000_000);

export const packageInput = z.object({
  tier: z.enum(TIERS),
  name: z.string().trim().min(2).max(60),
  priceSantim: santim.min(100),
  hours: z.number().int().min(1).max(72),
  includes: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
  addons: z
    .array(z.object({ name: z.string().trim().min(1).max(60), priceSantim: santim }))
    .max(8)
    .default([]),
});
export type PackageInput = z.input<typeof packageInput>;

/**
 * F20-AC4: up to three tiers (Basic / Standard / Premium), each with price, hours, what's
 * included and add-ons. Saving replaces the vendor's packages; tiers left out are switched off.
 */
export async function savePackages(vendorId: string, raw: PackageInput[]) {
  await assertVendor(vendorId);
  const input = z.array(packageInput).max(TIERS.length).parse(raw);
  if (new Set(input.map((p) => p.tier)).size !== input.length) throw new DomainError("VALIDATION", "One package per tier");
  await prisma.$transaction(async (tx) => {
    await tx.package.updateMany({ where: { vendorId, tier: { notIn: input.map((p) => p.tier) } }, data: { active: false } });
    for (const p of input) {
      const row = await tx.package.upsert({
        where: { vendorId_tier: { vendorId, tier: p.tier } },
        create: { vendorId, tier: p.tier, name: p.name, priceSantim: p.priceSantim, hours: p.hours, includes: p.includes },
        update: { name: p.name, priceSantim: p.priceSantim, hours: p.hours, includes: p.includes, active: true },
      });
      await tx.packageAddon.deleteMany({ where: { packageId: row.id } });
      if (p.addons.length) await tx.packageAddon.createMany({ data: p.addons.map((a) => ({ ...a, packageId: row.id })) });
    }
    await refreshVendorStats(tx, vendorId);
  });
  return listPackages(vendorId);
}

export function listPackages(vendorId: string) {
  return prisma.package.findMany({
    where: { vendorId, active: true },
    include: { addons: true },
    orderBy: { priceSantim: "asc" },
  });
}
