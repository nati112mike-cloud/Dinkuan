import { expect, test } from "@playwright/test";
import { addisDate, approveDemoPayment, EN, freshPhone, login, newPage, snap } from "./helpers";

test.use(EN);

// A 1×1 PNG, enough for the licence and poster uploads.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

/**
 * Organiser demo journey on a phone: apply as a business, get approved, create an event with
 * three ticket tiers, go through review, sell a ticket and see it on the dashboard.
 */
test("F2/F3/F11/F12: new organiser publishes a paid event with 3 tiers and sees the sale", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const orgName = `Rophnan Live ${Date.now().toString().slice(-5)}`;

  // F2-AC1: apply with TIN, trade licence and Telebirr payout.
  await login(page, freshPhone(), "/organiser", "Abel Organiser");
  await expect(page.getByRole("heading", { name: "Sell tickets on ድንኳን" })).toBeVisible();
  await page.getByLabel("Organiser name").fill(orgName);
  await page.getByLabel("TIN (10 digits)").fill("0012345678");
  await page.getByLabel("Trade licence photo").setInputFiles({ name: "licence.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText("Licence uploaded")).toBeVisible();
  await page.getByLabel("Payout account").fill("0911223344");
  await snap(page, "o01-apply");
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByTestId("org-status")).toContainText("being reviewed");

  // F12-AC1: the admin approves it from the queue.
  const admin = await newPage(browser);
  await login(admin, "0911000004", "/admin");
  const app = admin.getByTestId("org-review").filter({ hasText: orgName });
  await expect(app).toContainText("TIN 0012345678");
  await snap(admin, "o02-admin-queue");
  await app.getByRole("button", { name: "Approve" }).click();
  await expect(app).toHaveCount(0);

  // F3 step 1: details. No poster uploaded, so the generated one is used.
  await page.goto("/organiser");
  await expect(page.getByRole("heading", { name: orgName })).toBeVisible();
  await snap(page, "o03-dashboard-empty");
  await page.getByRole("link", { name: "+ New event" }).click();
  await page.getByLabel("Title (English)").fill("Rophnan at Millennium Hall");
  await page.getByLabel("Title (Amharic)").fill("ሮፍናን በሚሊኒየም አዳራሽ");
  await page.getByLabel("Category").selectOption("concert");
  await page.getByTestId("venue-select").selectOption({ label: "Millennium Hall" });
  await page.getByLabel("Starts").fill(`${addisDate(14)}T19:00`);
  await page.getByLabel("Ends").fill(`${addisDate(14)}T23:30`);
  await page.getByLabel("Line-up").fill("Rophnan, DJ Kaleb");
  await snap(page, "o04-details");
  await page.getByRole("button", { name: "Next: tickets" }).click();

  // F3 step 2: three tiers.
  await expect(page.getByRole("heading", { name: "Ticket types" })).toBeVisible();
  const rows = page.getByTestId("ticket-row");
  await rows.nth(0).getByTestId("ticket-price").fill("500");
  await rows.nth(0).getByTestId("ticket-capacity").fill("800");
  for (const [name, price, cap] of [
    ["VIP", "1500", "150"],
    ["Early bird", "350", "200"],
  ]) {
    await page.getByRole("button", { name: "+ Add ticket type" }).click();
    const row = rows.last();
    await row.getByLabel("Ticket name").fill(name!);
    await row.getByTestId("ticket-price").fill(price!);
    await row.getByTestId("ticket-capacity").fill(cap!);
  }
  await expect(rows).toHaveCount(3);
  await snap(page, "o05-tickets");
  await page.getByRole("button", { name: "Save and review" }).click();

  // F3 step 3 and AC5: a new organiser's event goes to review first.
  await expect(page.getByRole("heading", { name: "Rophnan at Millennium Hall" })).toBeVisible();
  await expect(page.getByText("Early bird")).toBeVisible();
  await snap(page, "o06-review");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByTestId("event-status")).toHaveText("In review");
  const eventUrl = page.url();

  await admin.goto("/admin");
  const queued = admin.getByTestId("event-review").filter({ hasText: "Rophnan at Millennium Hall" });
  await expect(queued).toContainText("VIP 1,500");
  await queued.getByRole("button", { name: "Publish" }).click();
  await expect(queued).toHaveCount(0);

  // A buyer buys a VIP ticket and agrees to share their phone.
  const buyer = await newPage(browser);
  const buyerPhone = freshPhone();
  await login(buyer, buyerPhone, "/", "Liya Buyer");
  await page.reload();
  await expect(page.getByTestId("event-status")).toHaveText("Live");
  const slug = await page.getByRole("link", { name: /View event page/ }).getAttribute("href");
  await buyer.goto(slug!);
  await buyer.locator("#tickets").scrollIntoViewIfNeeded();
  await buyer.locator("li", { hasText: "VIP" }).getByRole("button", { name: "+" }).click();
  await buyer.getByRole("button", { name: /Continue/ }).click();
  await expect(buyer.getByRole("heading", { name: "Review your order" })).toBeVisible();
  await buyer.getByText("Share my phone number with the organiser").click();
  await buyer.getByRole("button", { name: /^Pay / }).click();
  await approveDemoPayment(buyer);
  await expect(buyer.getByRole("heading", { name: "You're in!" })).toBeVisible();

  // F11-AC1/AC2: the sale, the fee kept apart, and the attendee with the consented phone.
  await page.goto(eventUrl);
  const stats = page.getByTestId("event-stats");
  await expect(stats).toContainText("1,500");
  await expect(page.getByTestId("attendees")).toContainText("Liya Buyer");
  await expect(page.getByTestId("attendees")).toContainText(buyerPhone.slice(1));
  await snap(page, "o07-event-dashboard");
  const csv = await page.request.get(`${eventUrl.replace("/organiser/events/", "/api/organiser/events/")}/attendees`);
  expect(csv.ok()).toBe(true);
  expect(await csv.text()).toContain('"Liya Buyer","VIP","no"');

  // F12-AC2: the admin features it.
  await admin.goto("/admin/events");
  const row = admin.getByTestId("admin-event").filter({ hasText: "Rophnan at Millennium Hall" });
  await row.getByRole("button", { name: "Feature" }).click();
  await expect(row.getByRole("button", { name: "Unfeature" })).toBeVisible();
  await snap(admin, "o08-admin-events");
});
