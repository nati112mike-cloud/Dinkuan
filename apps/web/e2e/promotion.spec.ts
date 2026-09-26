import { expect, test } from "@playwright/test";
import { approveDemoPayment, EN, freshPhone, login, newPage, snap } from "./helpers";

test.use(EN);

/**
 * Promotion demo journey (Slice 15 done-when): an organiser buys Event Spotlight, it passes ad
 * review, shows labelled Sponsored, and its results count a ticket sale. Stopping refunds the rest.
 */
test("F21: organiser buys Event Spotlight, admin approves, it shows labelled and counts a sale", async ({ page, browser }) => {
  // F21-AC3: buy through the gateway.
  await login(page, "0911000003", "/e/derby-watch-party");
  await page.getByRole("link", { name: /Promote/ }).click();
  const spotlight = page.getByTestId("promo-event_spotlight");
  await expect(spotlight.getByText(/Estimated reach/)).toBeVisible();
  await snap(page, "p01-packages");
  await page.waitForLoadState("networkidle");
  await spotlight.getByRole("button", { name: "Pay with Telebirr" }).click();
  await approveDemoPayment(page);
  await page.waitForURL(/\/promote\/c\//);
  const campaignId = page.url().split("/promote/c/")[1]!.split(/[?#]/)[0]!;
  await expect(page.getByTestId("campaign-status")).toContainText("In review");
  await snap(page, "p02-in-review");

  // F21-AC5: an admin approves it.
  const admin = await newPage(browser);
  await login(admin, "0911000004", "/admin/ads");
  const item = admin.getByTestId("ad-review-item").filter({ has: admin.locator(`a[href="/promote/c/${campaignId}"]`) });
  await expect(item).toBeVisible();
  await snap(admin, "p03-ad-review");
  await item.getByRole("button", { name: "Approve" }).click();
  await expect(item).toHaveCount(0);
  await admin.context().close();

  // F21-AC6: a visitor sees it labelled in Featured events.
  const visitor = await newPage(browser);
  await visitor.goto("/events");
  const ad = visitor.locator(`a[href*="c=${campaignId}"]`).first();
  await expect(ad).toBeVisible();
  await expect(ad.getByText("Sponsored · ማስታወቂያ")).toBeVisible();
  await snap(visitor, "p04-sponsored");

  // F21-AC7: they click through and buy a ticket, which counts as a conversion.
  await ad.click();
  await visitor.waitForURL(/\/e\/derby-watch-party/);
  await visitor.locator("#tickets").scrollIntoViewIfNeeded();
  await visitor.locator("li", { hasText: "Entry" }).getByRole("button", { name: "+" }).click();
  await visitor.getByRole("button", { name: /Continue/ }).click();
  await visitor.getByLabel("Phone number").fill(freshPhone());
  await visitor.getByRole("button", { name: "Send code" }).click();
  await visitor.getByLabel("6-digit code").fill("123456");
  await visitor.getByRole("button", { name: "Log in" }).click();
  await visitor.getByLabel(/Your name/).fill("Abebe Fan");
  await visitor.getByLabel("Date of birth").fill("1995-05-05");
  await visitor.getByLabel(/community guidelines/).check();
  await visitor.getByRole("button", { name: "Continue" }).click();
  await visitor.getByRole("button", { name: /^Pay / }).click();
  await approveDemoPayment(visitor);
  await expect(visitor.getByRole("heading", { name: "You're in!" })).toBeVisible();
  await visitor.context().close();

  await page.reload();
  await expect(page.getByTestId("campaign-status")).toContainText("Running");
  const results = page.getByTestId("campaign-results");
  await expect(results.locator("div", { hasText: "Ticket sales" }).first()).toContainText("1");
  await expect(results.locator("div", { hasText: "Clicks" }).first()).toContainText("1");
  await snap(page, "p05-results");

  // F21-AC8: stopping early refunds the unspent budget.
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Stop promotion" }).click();
  await expect(page.getByTestId("campaign-status")).toContainText("Ended");
  await expect(page.getByText(/refunded/)).toBeVisible();
});
