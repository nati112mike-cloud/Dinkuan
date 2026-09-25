import { PrismaClient } from "@prisma/client";

// Explicit value exports keep bundlers happy (the Prisma client is CommonJS).
export { Prisma, PrismaClient } from "@prisma/client";
export type * from "@prisma/client";

const globalForPrisma = globalThis as unknown as { dinkuanPrisma?: PrismaClient };

/** One Prisma client per process (Next.js dev reloads modules, so cache it on globalThis). */
export const prisma: PrismaClient = globalForPrisma.dinkuanPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.dinkuanPrisma = prisma;
