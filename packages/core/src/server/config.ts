/**
 * Demo mode fakes payments and SMS. It must never run in production, so a production deployment
 * (APP_ENV=production) with DEMO_MODE=true refuses to serve anything rather than hand out free
 * tickets and open logins.
 */
export function isDemoMode(): boolean {
  const demo = process.env.DEMO_MODE === "true";
  if (demo && process.env.APP_ENV === "production") {
    throw new Error("DEMO_MODE=true is not allowed when APP_ENV=production");
  }
  return demo;
}

export function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}
