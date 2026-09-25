export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

export function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}
