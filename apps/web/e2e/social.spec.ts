import { expect, test, type Page } from "@playwright/test";

test.use({ storageState: { cookies: [{ name: "dk_lang", value: "en", domain: "localhost", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" }], origins: [] } });

/** A small PNG made in the browser, to upload as a photo. */
async function pngBuffer(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 400;
    c.height = 500;
    const ctx = c.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, 400, 500);
    g.addColorStop(0, "#e0873a");
    g.addColorStop(1, "#3d1b0b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 400, 500);
    return c.toDataURL("image/png");
  });
  return Buffer.from(dataUrl.split(",")[1]!, "base64");
}

/**
 * Social demo journey: sign up → onboarding (username, interests, ≥10 suggestions) → post text and
 * a photo → comment → react in the feed → find people in Amharic → reels → event Moments.
 */
test("a new member joins, posts, comments, reacts and finds people", async ({ page }) => {
  const stamp = String(Date.now()).slice(-8);
  await page.goto("/login?next=/");
  await page.getByLabel("Phone number").fill(`09${stamp}`);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByLabel(/Your name/).fill("Test Member");
  await page.getByRole("button", { name: "Continue" }).click();

  // F17-AC1 onboarding
  await expect(page.getByText("Pick your username")).toBeVisible();
  const username = `e2e_${stamp}`;
  await page.waitForLoadState("networkidle"); // let the form hydrate before typing
  await page.getByRole("textbox").fill(username);
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Music" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByTestId("person").nth(9)).toBeVisible();
  await page.getByTestId("person").first().getByRole("button", { name: /Follow/ }).click();
  await expect(page.getByTestId("person").first().getByRole("button", { name: "Following" })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("link", { name: "For You" })).toBeVisible();

  // F15 text post with a hashtag
  await page.goto("/create");
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/Write a caption/).fill(`Hello Addis from the e2e test #e2e${stamp}`);
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await page.waitForURL(/\/p\//);
  await expect(page.getByText("Hello Addis from the e2e test")).toBeVisible();

  // F16-AC3 comment on it
  await page.getByLabel("Add a comment…").fill("First!");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("comment").filter({ hasText: "First!" })).toBeVisible();

  // Hashtag page
  await page.getByRole("link", { name: `#e2e${stamp}` }).click();
  await expect(page.getByText("Hello Addis from the e2e test")).toBeVisible();

  // F15-AC1/AC6 photo post: compressed on the device, uploaded in chunks, tagged to an event
  await page.goto("/create");
  await page.waitForLoadState("networkidle");
  await page.getByRole("tab", { name: /Photos/ }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "moment.png", mimeType: "image/png", buffer: await pngBuffer(page) });
  await page.getByLabel(/Write a caption/).fill("Rooftop moment");
  await page.getByLabel("Tag an event").selectOption({ label: "Afro House Rooftop" });
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await page.waitForURL(/\/p\//);
  await expect(page.locator('img[src^="/api/media/"]')).toBeVisible();

  // F15-AC5 it shows in the event's Moments
  await page.goto("/e/afro-house-rooftop-tonight");
  await expect(page.getByRole("heading", { name: /Moments/ })).toBeVisible();
  await expect(page.locator("#moments").getByTestId("grid-post").first()).toBeVisible();

  // F14 my profile shows both posts
  await page.goto(`/u/${username}`);
  await expect(page.getByTestId("grid-post")).toHaveCount(2);

  // F16-AC2 react to a post in For You
  await page.goto("/");
  const first = page.getByTestId("post").first();
  const react = first.getByRole("button", { name: "React" }).first();
  await expect(react).toHaveAttribute("aria-pressed", "false");
  await react.click();
  await expect(react).toHaveAttribute("aria-pressed", "true");

  // F17-AC4 search people in Amharic
  await page.goto("/people");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Search by name or @username").fill("ሰላም");
  await expect(page.getByTestId("person").filter({ hasText: "@selam.beats" })).toBeVisible();

  // F16-AC7 reels player
  await page.goto("/reels");
  await expect(page.getByTestId("reel").first()).toBeVisible();
});
