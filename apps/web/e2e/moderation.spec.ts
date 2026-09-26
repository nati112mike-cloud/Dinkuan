import { expect, test } from "@playwright/test";
import { EN, freshPhone, login, newPage, snap } from "./helpers";

test.use(EN);

/**
 * F22 on a phone: a member signs up accepting the guidelines, posts, another member reports the
 * post, a moderator removes it from the queue, the author appeals and a second moderator reverses
 * the decision.
 */
test("F22: report → moderator removes → author appeals → a different moderator reverses", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const run = Date.now().toString().slice(-6);
  const caption = `Comedy night review ${run}: the second act was weak`;

  // F22-AC1: guidelines at sign-up (the login helper ticks the box), readable in both languages.
  await login(page, freshPhone(), "/create", "Author Member");
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/Write a caption/).fill(caption);
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await page.waitForURL(/\/p\//);
  const postUrl = new URL(page.url()).pathname;

  // F22-AC3: someone else reports it with a reason.
  const reporter = await newPage(browser);
  await login(reporter, freshPhone(), postUrl, "Reporter Member");
  await reporter.goto(postUrl);
  await reporter.getByRole("button", { name: "More", exact: true }).first().click();
  await reporter.getByRole("button", { name: /Report/ }).click();
  await reporter.getByText("Harassment or bullying").click();
  await reporter.getByLabel(/Anything else we should know/).fill("Mocking the comedians by name");
  await snap(reporter, "m01-report");
  await reporter.getByRole("button", { name: "Send report" }).click();
  await expect(reporter.getByText("Thanks. Our moderators will review it.")).toBeVisible();

  // F22-AC4: the moderator sees it in the queue with the reason and removes it.
  const mod = await newPage(browser);
  await login(mod, "0911000004", "/admin/moderation");
  const item = mod.getByTestId("mod-item").filter({ hasText: caption });
  await expect(item).toContainText("Harassment or bullying × 1");
  await expect(item).toContainText("Mocking the comedians");
  await snap(mod, "m02-queue");
  await item.getByRole("button", { name: "Remove" }).click();
  await expect(item).toHaveCount(0);

  await reporter.goto(postUrl);
  await expect(reporter.getByText(caption)).toHaveCount(0);

  // The author is told by ድንኳን (not a named moderator) and appeals once (F22-AC6).
  await page.goto("/notifications");
  const notice = page.getByRole("link", { name: /removed something you posted/ }).first();
  await expect(notice).toContainText("ድንኳን");
  await notice.click();
  await expect(page.getByTestId("decision")).toContainText("Removed");
  await expect(page.getByTestId("decision")).toContainText("Harassment or bullying");
  await page.getByLabel("Tell us why this decision should change").fill("It's a fair review of a show, not harassment.");
  await snap(page, "m03-appeal");
  await page.getByRole("button", { name: "Send appeal" }).click();
  await expect(page.getByTestId("appeal-status")).toHaveText("Your appeal is waiting for review.");

  // The moderator who removed it can't decide the appeal; a second one reverses it.
  await mod.goto("/admin/moderation/appeals");
  const own = mod.getByTestId("appeal-item").filter({ hasText: "fair review of a show" });
  await expect(own).toBeVisible();
  await expect(own.getByRole("button", { name: "Reverse" })).toHaveCount(0);
  const mod2 = await newPage(browser);
  await login(mod2, "0911000008", "/admin/moderation/appeals");
  const appeal = mod2.getByTestId("appeal-item").filter({ hasText: "fair review of a show" });
  await snap(mod2, "m04-appeals");
  await appeal.getByRole("button", { name: "Reverse" }).click();
  await expect(appeal).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId("appeal-status")).toHaveText("Your appeal was accepted and the decision was reversed.");
  await reporter.goto(postUrl);
  await expect(reporter.getByText(caption)).toBeVisible();

  await page.goto("/guidelines");
  await expect(page.getByRole("heading", { name: "Community guidelines" })).toBeVisible();
  await snap(page, "m05-guidelines");
});
