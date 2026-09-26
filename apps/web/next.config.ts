import path from "node:path";
import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

/**
 * Security headers on every response. Everything the app loads is same-origin (posters, media,
 * HLS segments via blob:), so the policy can stay tight. Inline scripts stay allowed because the
 * App Router streams its payload in inline <script> tags; dev also needs eval for fast refresh.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  transpilePackages: ["@dinkuan/core", "@dinkuan/i18n", "@dinkuan/payments", "@dinkuan/db", "@dinkuan/social", "@dinkuan/marketplace", "@dinkuan/ads", "@dinkuan/bot"],
  serverExternalPackages: ["@prisma/client"],
  // Trace files from the monorepo root so hosted builds (Vercel) ship the Prisma engine.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  outputFileTracingIncludes: { "/**": ["../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/**"] },
};

export default config;
