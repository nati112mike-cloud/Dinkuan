import { expect, test, type APIRequestContext } from "@playwright/test";

const SCANNER = process.env.SCANNER_URL ?? "http://localhost:5173";
const shots = process.env.E2E_SCREENSHOTS;

/** Buy tickets through the real API as the demo buyer, return their static QR payloads. */
async function buyTickets(request: APIRequestContext, qty: number): Promise<string[]> {
  const phone = `09${String(Date.now()).slice(-8)}`;
  await request.post("/api/auth/otp/request", { data: { phone } });
  await request.post("/api/auth/otp/verify", { data: { phone, code: "123456" } });
  await request.post("/api/me", { data: { name: "Abebe Kebede", birthDate: "1995-05-05", acceptGuidelines: true } });
  const page = await request.get("/e/afro-house-rooftop-tonight");
  const html = await page.text();
  const eventId = /"eventId":"([0-9a-f-]{36})"/.exec(html)?.[1] ?? /eventId\\":\\"([0-9a-f-]{36})/.exec(html)?.[1];
  const ttId = /"id\\?":\\?"([0-9a-f-]{36})\\?",\\?"name\\?":\\?"Regular/.exec(html)?.[1];
  expect(eventId && ttId).toBeTruthy();
  const checkout = await (await request.post("/api/checkout", { data: { eventId, gateway: "telebirr", items: [{ ticketTypeId: ttId, qty }] } })).json();
  const ref = decodeURIComponent(checkout.data.checkoutUrl.split("/demo-pay/")[1]);
  await request.post(`/api/demo-pay/${encodeURIComponent(ref)}`, { data: { action: "confirm" } });
  const wallet = await (await request.get("/api/tickets")).json();
  return wallet.data.tickets.filter((t: { event: { slug: string } }) => t.event.slug === "afro-house-rooftop-tonight").map((t: { qr: { static: string } }) => t.qr.static);
}

test("gate staff scan tickets offline and sync", async ({ page, request }) => {
  const codes = await buyTickets(request, 3);
  expect(codes).toHaveLength(3);

  await page.goto(SCANNER);
  await page.getByRole("button", { name: "EN" }).click();
  await page.getByLabel("Phone number").fill("0911000002");
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Afro House Rooftop")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/20-scanner-events.png` });
  await page
    .locator("div", { has: page.getByText("Afro House Rooftop", { exact: true }) })
    .last()
    .getByRole("button", { name: "Download for offline" })
    .click();

  // Wait for the pack to land and the gate screen to open before going offline.
  await expect(page.getByLabel("Or paste a ticket code")).toBeVisible({ timeout: 15_000 });

  // Everything below runs with the network off.
  await page.context().setOffline(true);
  const paste = page.getByLabel("Or paste a ticket code");
  await paste.fill(codes[0]!);
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByTestId("scan-result")).toContainText("VALID");
  await expect(page.getByTestId("scan-result")).toContainText("Abebe Kebede");
  if (shots) await page.screenshot({ path: `${shots}/21-scanner-valid.png` });
  await page.getByTestId("scan-result").click();

  await page.waitForTimeout(1600);
  await paste.fill(codes[0]!);
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByTestId("scan-result")).toContainText("Already used");
  if (shots) await page.screenshot({ path: `${shots}/22-scanner-used.png` });
  await page.getByTestId("scan-result").click();

  await page.waitForTimeout(1600);
  // A forged code: flip one character in the middle of the signature.
  const code = codes[1]!;
  const i = code.length - 20;
  await paste.fill(code.slice(0, i) + (code[i] === "A" ? "B" : "A") + code.slice(i + 1));
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByTestId("scan-result")).toContainText("INVALID");
  await page.getByTestId("scan-result").click();

  await expect(page.getByTestId("counter")).toContainText("1 waiting to sync");

  // Back online: sync pushes the check-in to the server.
  await page.context().setOffline(false);
  await page.getByRole("button", { name: /Sync/ }).click();
  await expect(page.getByText("Synced 1 check-ins")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/23-scanner-synced.png` });
});
