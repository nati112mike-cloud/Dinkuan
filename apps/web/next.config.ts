import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@dinkuan/core", "@dinkuan/i18n", "@dinkuan/payments", "@dinkuan/db"],
  serverExternalPackages: ["@prisma/client"],
};

export default config;
