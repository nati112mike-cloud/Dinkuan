import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@dinkuan/core", "@dinkuan/i18n", "@dinkuan/payments", "@dinkuan/db"],
  serverExternalPackages: ["@prisma/client"],
  // Trace files from the monorepo root so hosted builds (Vercel) ship the Prisma engine.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  outputFileTracingIncludes: { "/**": ["../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/**"] },
};

export default config;
