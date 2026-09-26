import { expect, test } from "@playwright/test";

const shots = process.env.E2E_SCREENSHOTS;
const snap = async (page: import("@playwright/test").Page, name: string) => {
  if (!shots) return;
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: false });
};

/**
 * Core demo journey: browse → event → pick tickets → log in with phone → review → pay with the
 * demo gateway → tickets in the wallet with a rotating QR.
 */
test("buyer buys a ticket and sees a rotating QR", async ({ page }) => {
  const phone = `09${String(Date.now()).slice(-8)}`;
  await page.goto("/?tab=events");
  await expect(page.getByRole("heading", { name: /ተመራጭ|Featured/ })).toBeVisible();
  await snap(page, "01-home-am");

  // Switch to English
  await page.getByRole("button", { name: "Change language" }).click();
  await expect(page.getByRole("heading", { name: "Featured" })).toBeVisible();
  await snap(page, "02-home-en");

  await page.goto("/e/addis-jazz-weekend");
  await expect(page.getByRole("heading", { name: "Addis Ethio-Jazz Weekend" })).toBeVisible();
  await snap(page, "03-event");
  await page.locator("#tickets").scrollIntoViewIfNeeded();
  const regular = page.locator("li", { hasText: "Regular" });
  await regular.getByRole("button", { name: "+" }).click();
  await regular.getByRole("button", { name: "+" }).click();
  await snap(page, "04-select-tickets");
  await page.getByRole("button", { name: /Continue/ }).click();

  // Phone login (demo code)
  await page.getByLabel("Phone number").fill(phone);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("6-digit code").fill("123456");
  await snap(page, "05-login-code");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByLabel(/Your name/).fill("Selam Getachew");
  await page.getByLabel("Date of birth").fill("1995-05-05");
  await page.getByLabel(/community guidelines/).check();
  await page.getByRole("button", { name: "Continue" }).click();

  // Review + pay
  await expect(page.getByRole("heading", { name: "Review your order" })).toBeVisible();
  await expect(page.getByText("Service fee")).toBeVisible();
  await snap(page, "06-review");
  await page.getByRole("button", { name: /^Pay / }).click();

  // Demo gateway page
  await expect(page.getByText("Simulated payment")).toBeVisible();
  await page.getByPlaceholder("••••").fill("1234");
  await snap(page, "07-demo-telebirr");
  await page.getByRole("button", { name: "Approve payment" }).click();

  await expect(page.getByRole("heading", { name: "You're in!" })).toBeVisible();
  await snap(page, "08-paid");
  await page.getByRole("link", { name: "View my tickets" }).click();
  await expect(page.getByText("Addis Ethio-Jazz Weekend").first()).toBeVisible();
  await snap(page, "09-wallet");
  await page.getByText("Addis Ethio-Jazz Weekend").first().click();
  await expect(page.getByTestId("ticket-qr").locator("svg")).toBeVisible();
  await expect(page.getByText("Selam Getachew")).toBeVisible();
  await snap(page, "10-ticket-qr");

  // Offline: the wallet still shows the ticket from the device cache.
  await page.goto("/tickets");
  await expect(page.getByText("Addis Ethio-Jazz Weekend").first()).toBeVisible();
  await page.context().setOffline(true);
  await page.reload().catch(() => undefined); // served by the service worker cache
  await expect(page.getByText("Offline: showing saved tickets")).toBeVisible();
  await snap(page, "12-wallet-offline");
  await page.getByText("Addis Ethio-Jazz Weekend").first().click();
  await expect(page.getByTestId("ticket-qr").locator("svg")).toBeVisible();
  await page.context().setOffline(false);
});

test("search and filters", async ({ page }) => {
  await page.goto("/events?q=jazz");
  await expect(page.getByText(/Ethio-Jazz|ኢትዮ-ጃዝ/)).toBeVisible();
  await page.goto("/events?q=ጃዝ");
  await expect(page.getByText(/Ethio-Jazz|ኢትዮ-ጃዝ/)).toBeVisible();
  await page.goto("/events?price=free");
  await expect(page.getByText(/Meskel Community|የመስቀል/)).toBeVisible();
  await snap(page, "11-search");
});
