import { expect, test } from "@playwright/test";
import { addisDate, EN, freshPhone, login, newPage, snap } from "./helpers";

test.use(EN);

/**
 * Marketplace demo journey (Slice 14 done-when): a client finds a DJ free on a date, compares
 * three, sends a booking request and chats, and never sees a phone number.
 */
test("F20: client finds a free DJ, compares 3, requests and chats with contacts masked", async ({ page, browser }) => {
  // F20-AC5: DJ Kaleb blocks one date on his calendar and keeps the next day free.
  const busy = addisDate(20);
  const free = addisDate(21);
  const vendor = await newPage(browser);
  await login(vendor, "0911100001", "/vendor/calendar");
  const saved = await vendor.request.post("/api/vendor/availability", { data: { block: [busy], unblock: [free] } });
  expect(saved.ok()).toBe(true);

  await login(page, freshPhone(), "/hire", "Marta Client");
  await expect(page.getByRole("heading", { name: "Hire for your event" })).toBeVisible();
  await snap(page, "m01-hire");

  // F20-AC8/AC9: searching by date leaves out DJs who aren't free.
  await page.goto(`/hire?type=dj&date=${busy}`);
  await expect(page.getByTestId("vendor-card").first()).toBeVisible();
  await expect(page.getByTestId("vendor-card").filter({ hasText: "DJ Kaleb" })).toHaveCount(0);
  await page.goto(`/hire?type=dj&date=${free}`);
  const kaleb = page.getByTestId("vendor-card").filter({ hasText: "DJ Kaleb" });
  await expect(kaleb).toBeVisible();
  await expect(kaleb.getByText("Free that day")).toBeVisible();
  await snap(page, "m02-dj-results");

  // F20-AC12: compare three.
  const cards = page.getByTestId("vendor-card");
  await page.waitForLoadState("networkidle");
  for (let i = 0; i < 3; i++) await cards.nth(i).getByRole("button", { name: /Compare/ }).click();
  await expect(page.getByText("3/3 to compare")).toBeVisible();
  await page.getByRole("link", { name: "Compare now" }).click();
  await expect(page.getByTestId("compare").locator("thead th")).toHaveCount(4);
  await snap(page, "m03-compare");

  // F20-AC14: request a booking from DJ Kaleb.
  await page.goto(`/hire/v/djkaleb`);
  await expect(page.getByRole("heading", { name: "DJ Kaleb" })).toBeVisible();
  await snap(page, "m04-pro-profile");
  await page.getByRole("link", { name: "Request to book" }).last().click();
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Date").fill(free);
  await page.getByLabel("Venue").fill("Hyatt Regency ballroom");
  await page.getByLabel("Notes").fill("Call me on 0911 234 567 to talk it over");
  await snap(page, "m05-request");
  await page.getByRole("button", { name: "Send request" }).click();
  await page.waitForURL(/\/inbox\//);

  // F20-AC15 / rule 16: contact details are masked in chat.
  await expect(page.getByText("Phone numbers and links stay hidden")).toBeVisible();
  await page.getByLabel("Write a message").fill("Or WhatsApp me: zero nine one one two three four five six seven, @marta_addis");
  await page.getByRole("button", { name: "Send" }).click();
  const messages = page.getByTestId("messages");
  await expect(messages.getByText("contact hidden").first()).toBeVisible();
  await expect(page.getByText("0911 234 567")).toHaveCount(0);
  await expect(messages).not.toContainText("@marta_addis");
  await expect(messages).not.toContainText("zero nine one one");
  await snap(page, "m06-chat-masked");

  // The vendor sees the request in their inbox, masked too.
  await vendor.goto("/inbox");
  await vendor.getByText("Marta Client").first().click();
  await expect(vendor.getByText("Hyatt Regency ballroom")).toBeVisible();
  await expect(vendor.getByText("0911 234 567")).toHaveCount(0);
  await expect(vendor.getByTestId("messages")).not.toContainText("@marta_addis");
  await vendor.getByLabel("Write a message").fill("Selam! I'm free that day.");
  await vendor.getByRole("button", { name: "Send" }).click();
  await expect(vendor.getByTestId("messages").getByText("I'm free that day")).toBeVisible();
  await vendor.context().close();
});
