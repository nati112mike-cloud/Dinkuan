import { expect, type Browser, type Page } from "@playwright/test";

export const EN = {
  storageState: {
    cookies: [{ name: "dk_lang", value: "en", domain: "localhost", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" as const }],
    origins: [],
  },
};

const shots = process.env.E2E_SCREENSHOTS;
export async function snap(page: Page, name: string) {
  if (!shots) return;
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: false });
}

/** Logs in with the demo OTP. New numbers are asked for a name first. */
export async function login(page: Page, phone: string, next: string, name?: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Phone number").fill(phone);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: "Log in" }).click();
  if (name) {
    await page.getByLabel(/Your name/).fill(name);
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

export async function newPage(browser: Browser) {
  const ctx = await browser.newContext(EN);
  return ctx.newPage();
}

export function freshPhone() {
  return `09${String(Date.now()).slice(-8)}`;
}

/** YYYY-MM-DD in Addis Ababa, `days` from today. */
export function addisDate(days: number) {
  return new Date(Date.now() + 3 * 3600_000 + days * 86400_000).toISOString().slice(0, 10);
}

export async function approveDemoPayment(page: Page) {
  await expect(page.getByText("Simulated payment")).toBeVisible();
  await page.getByPlaceholder("••••").fill("1234");
  await page.getByRole("button", { name: "Approve payment" }).click();
}
