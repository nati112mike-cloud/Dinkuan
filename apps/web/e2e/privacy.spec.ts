import { expect, test } from "@playwright/test";
import { EN, freshPhone, login, snap } from "./helpers";

test.use(EN);

/** PRD 3 data protection: terms and privacy at sign-up, then download your data and delete your account. */
test("PDPP: a member reads the policies, downloads their data and deletes their account", async ({ page }) => {
  const phone = freshPhone();
  await login(page, phone, "/settings", "Privacy Tester");

  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
  await snap(page, "p01-privacy");
  await page.getByRole("link", { name: "Terms" }).click();
  await expect(page.getByRole("heading", { name: "Terms of Use" })).toBeVisible();

  await page.goto("/settings#data");
  const data = page.getByTestId("your-data");
  await data.scrollIntoViewIfNeeded();
  await snap(page, "p02-your-data");
  const download = page.waitForEvent("download");
  await data.getByRole("link", { name: /Download my data/ }).click();
  const file = await (await download).path();
  const json = JSON.parse(await (await import("node:fs/promises")).readFile(file, "utf8"));
  expect(json.account.name).toBe("Privacy Tester");
  expect(json.consents.map((c: { type: string }) => c.type).sort()).toEqual(["guidelines:v1", "privacy:v1", "terms:v1"]);

  page.on("dialog", (d) => void (d.type() === "prompt" ? d.accept("DELETE") : d.accept()));
  await data.getByRole("button", { name: "Delete my account" }).click();
  await page.waitForURL(/\/login/);

  // The number starts fresh: signing in again asks for a name like a new member.
  await login(page, phone, "/", "Back Again");
  await expect(page).not.toHaveURL(/\/login/);
});
