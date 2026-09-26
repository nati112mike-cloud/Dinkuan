import { expect, test } from "@playwright/test";
import { EN, freshPhone, login, snap } from "./helpers";

test.use(EN);

const yearsAgo = (years: number) => `${new Date().getUTCFullYear() - years}-01-01`;

/** F22-AC8: 13+ to join, 18+ for nightlife tickets, and teen accounts start private. */
test("F22-AC8: a teen sees the 18+ label, can't buy nightlife tickets and starts private", async ({ page }) => {
  await login(page, freshPhone(), "/e/afro-house-rooftop-tonight", "Teen Tester", yearsAgo(15));
  await expect(page.getByTestId("adults-only")).toContainText("18+");
  await snap(page, "a01-adults-only");
  await page.locator("#tickets").scrollIntoViewIfNeeded();
  await page.locator("li", { hasText: "Regular" }).getByRole("button", { name: "+" }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByTestId("age-check")).toContainText("18 and over");
  await expect(page.getByRole("button", { name: /^Pay / })).toHaveCount(0);
  await snap(page, "a02-teen-checkout");

  await page.goto("/settings");
  await expect(page.getByLabel(/Private account/)).toBeChecked();
});

test("F22-AC8: under 13 can't finish signing up", async ({ page }) => {
  await page.goto("/login?next=/");
  await page.getByLabel("Phone number").fill(freshPhone());
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByLabel(/Your name/).fill("Young Tester");
  await page.getByLabel("Date of birth").fill(yearsAgo(10));
  await page.getByLabel(/community guidelines/).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("13 or older")).toBeVisible();
  await expect(page.getByLabel("Phone number")).toBeVisible();
  await snap(page, "a03-underage");
  // Signed out: settings sends them back to log in.
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login/);
});
