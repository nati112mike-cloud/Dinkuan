import { prisma } from "@dinkuan/db";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createTelegramLoginLink,
  linkTelegramChat,
  redeemTelegramLoginToken,
  safeNextPath,
  sha256,
  TELEGRAM_LOGIN_TTL_MS,
  userForSession,
} from "../src/server";
import { makeUser, resetDb } from "./helpers";

beforeEach(resetDb);

function tokenOf(link: string) {
  return new URL(link).searchParams.get("token")!;
}

describe("F7 Telegram sign-in links", () => {
  it("F7-AC2: the link carries a random token; only its hash is stored", async () => {
    const user = await makeUser();
    const link = await createTelegramLoginLink(user.id, "/e/some-event#tickets");
    const url = new URL(link);
    expect(url.origin + url.pathname).toBe("http://localhost:3000/tg/login");
    expect(url.searchParams.get("next")).toBe("/e/some-event#tickets");
    const rows = await prisma.telegramLoginToken.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(sha256(tokenOf(link)));
    expect(rows[0]!.tokenHash).not.toContain(tokenOf(link));
    expect(rows[0]!.expiresAt.getTime() - Date.now()).toBeGreaterThan(TELEGRAM_LOGIN_TTL_MS - 5000);
  });

  it("F7-AC2: a sign-in token works once and starts a normal session", async () => {
    const user = await makeUser();
    const token = tokenOf(await createTelegramLoginLink(user.id, "/tickets"));
    const first = await redeemTelegramLoginToken(token);
    expect(first?.userId).toBe(user.id);
    expect((await userForSession(first!.sessionToken))?.id).toBe(user.id);
    expect(await redeemTelegramLoginToken(token)).toBeNull();
  });

  it("F7-AC2: a sign-in token expires after 15 minutes", async () => {
    const user = await makeUser();
    const token = tokenOf(await createTelegramLoginLink(user.id, "/tickets"));
    expect(await redeemTelegramLoginToken(token, new Date(Date.now() + TELEGRAM_LOGIN_TTL_MS + 1000))).toBeNull();
    expect(await redeemTelegramLoginToken("not-a-real-token")).toBeNull();
    expect(await redeemTelegramLoginToken(undefined)).toBeNull();
  });

  it("only same-site relative paths are allowed as the destination", () => {
    expect(safeNextPath("/e/x#tickets")).toBe("/e/x#tickets");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});

describe("F7 linking a chat by phone", () => {
  it("creates a buyer for a new number and links the chat", async () => {
    const res = await linkTelegramChat("251911223344", "555");
    expect(res.ok).toBe(true);
    const user = await prisma.user.findUniqueOrThrow({ where: { phone: "+251911223344" }, include: { roles: true } });
    expect(user.telegramChatId).toBe("555");
    expect(user.roles.map((r) => r.role)).toEqual(["buyer"]);
  });

  it("links an existing account and moves the chat off any older link", async () => {
    const existing = await makeUser();
    await linkTelegramChat("+251711000000", "777");
    const res = await linkTelegramChat(existing.phone, "777");
    expect(res.ok && res.user.id).toBe(existing.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { phone: "+251711000000" } })).telegramChatId).toBeNull();
    expect(await prisma.user.count()).toBe(2);
  });

  it("rejects numbers that are not Ethiopian mobiles", async () => {
    expect(await linkTelegramChat("+14155550100", "1")).toEqual({ ok: false, reason: "INVALID_PHONE" });
  });
});
