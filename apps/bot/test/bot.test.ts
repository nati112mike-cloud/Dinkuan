import { eventDateRange } from "@dinkuan/core";
import { redeemTelegramLoginToken, sha256 } from "@dinkuan/core/server";
import { prisma } from "@dinkuan/db";
import { t } from "@dinkuan/i18n";
import { beforeEach, describe, expect, it } from "vitest";
import { BOT_COMMANDS, commandMenu } from "../src";
import {
  buyTickets,
  callbackUpdate,
  contactUpdate,
  makeEvent,
  makeUser,
  resetDb,
  sentTexts,
  testBot,
  textUpdate,
} from "./helpers";

beforeEach(resetDb);

/** A start time in the middle of the given window, so it is inside it whatever day the test runs. */
function inWindow(filter: "today" | "weekend", now: Date) {
  const r = eventDateRange(filter, now);
  return new Date((r.from.getTime() + r.to!.getTime()) / 2);
}

describe("F7-AC1 commands", () => {
  it("F7-AC1: /start /weekend /tonight /mytickets /language /help all reply", async () => {
    await makeUser({ chatId: 501 });
    const { bot, calls } = testBot();
    for (const cmd of BOT_COMMANDS) {
      const before = calls.length;
      await bot.handleUpdate(textUpdate(501, `/${cmd}`));
      expect(calls.slice(before).some((c) => c.method === "sendMessage" || c.method === "sendPhoto"), cmd).toBe(true);
    }
  });

  it("F7-AC1: the command menu lists every command in both languages", () => {
    expect(commandMenu("en").map((c) => c.command)).toEqual([...BOT_COMMANDS]);
    expect(commandMenu("am").every((c) => c.description.length > 0)).toBe(true);
  });

  it("F7-AC1: /start asks an unlinked chat to share its phone with Telegram's contact button", async () => {
    const { bot, calls } = testBot();
    await bot.handleUpdate(textUpdate(502, "/start"));
    const reply = calls.find((c) => c.method === "sendMessage")!;
    expect(reply.payload.text).toContain(t("am", "bot.linkPrompt"));
    expect(reply.payload.reply_markup.keyboard[0][0]).toEqual({ text: t("am", "bot.sharePhone"), request_contact: true });
  });
});

describe("F7-AC5 language", () => {
  it("F7-AC5: replies in Amharic by default", async () => {
    const { bot, calls } = testBot();
    await bot.handleUpdate(textUpdate(503, "/help"));
    expect(sentTexts(calls)).toEqual([t("am", "bot.help")]);
  });

  it("F7-AC5: replies in the linked user's language", async () => {
    await makeUser({ chatId: 504, lang: "en" });
    const { bot, calls } = testBot();
    await bot.handleUpdate(textUpdate(504, "/help"));
    await bot.handleUpdate(textUpdate(504, "hello?"));
    expect(sentTexts(calls)).toEqual([t("en", "bot.help"), t("en", "bot.unknown")]);
  });

  it("F7-AC5: /language switches the language and saves it on the account", async () => {
    const user = await makeUser({ chatId: 505 });
    const { bot, calls } = testBot();
    await bot.handleUpdate(textUpdate(505, "/language"));
    const buttons = calls.at(-1)!.payload.reply_markup.inline_keyboard[0];
    expect(buttons.map((b: { callback_data: string }) => b.callback_data)).toEqual(["lang:am", "lang:en"]);
    await bot.handleUpdate(callbackUpdate(505, "lang:en"));
    expect(sentTexts(calls).at(-1)).toBe(t("en", "bot.language.set"));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).lang).toBe("en");
    await bot.handleUpdate(textUpdate(505, "/help"));
    expect(sentTexts(calls).at(-1)).toBe(t("en", "bot.help"));
  });

  it("F7-AC5: a language picked before linking is kept when the phone is shared", async () => {
    const { bot, calls } = testBot();
    await bot.handleUpdate(callbackUpdate(506, "lang:en"));
    expect(sentTexts(calls).at(-1)).toContain(t("en", "bot.language.saveHint"));
    await bot.handleUpdate(textUpdate(506, "/help"));
    expect(sentTexts(calls).at(-1)).toBe(t("en", "bot.help"));
    await bot.handleUpdate(contactUpdate(506, { phone: "251911556677", userId: 506 }));
    expect((await prisma.user.findUniqueOrThrow({ where: { phone: "+251911556677" } })).lang).toBe("en");
  });
});

describe("F7 linking by phone", () => {
  it("F7: only the sender's own contact links the chat", async () => {
    const { bot, calls } = testBot();
    // Someone else's contact card (different Telegram user id, or none) is refused.
    await bot.handleUpdate(contactUpdate(510, { phone: "+251911000111", userId: 999 }));
    await bot.handleUpdate(contactUpdate(510, { phone: "+251911000111" }));
    expect(sentTexts(calls)).toEqual([t("am", "bot.notOwnContact"), t("am", "bot.notOwnContact")]);
    expect(await prisma.user.count()).toBe(0);

    await bot.handleUpdate(contactUpdate(510, { phone: "+251911000111", userId: 510 }));
    const user = await prisma.user.findUniqueOrThrow({ where: { phone: "+251911000111" }, include: { roles: true } });
    expect(user.telegramChatId).toBe("510");
    expect(user.roles.map((r) => r.role)).toEqual(["buyer"]);
    expect(sentTexts(calls)).toContain(t("am", "bot.linked", { phone: "+251 •••• 0111" }));
  });

  it("F7: links an existing account found by its normalised phone", async () => {
    const existing = await makeUser();
    const { bot } = testBot();
    await bot.handleUpdate(contactUpdate(511, { phone: existing.phone.slice(1), userId: 511 }));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: existing.id } })).telegramChatId).toBe("511");
    expect(await prisma.user.count({ where: { phone: existing.phone } })).toBe(1);
  });

  it("F7: non-Ethiopian numbers are refused", async () => {
    const { bot, calls } = testBot();
    await bot.handleUpdate(contactUpdate(512, { phone: "+14155550100", userId: 512 }));
    expect(sentTexts(calls)).toEqual([t("am", "bot.invalidPhone")]);
    expect(await prisma.user.count()).toBe(0);
  });
});

describe("F7-AC2 event cards", () => {
  it("F7-AC2: /weekend sends poster cards with date, price and a web_app Buy button carrying a signed link", async () => {
    const now = new Date();
    const user = await makeUser({ chatId: 520, lang: "en" });
    const { event } = await makeEvent({ startsAt: inWindow("weekend", now), titleEn: "Ethio Jazz Weekend", price: 50000 });
    await makeEvent({ startsAt: new Date(eventDateRange("weekend", now).to!.getTime() + 86400_000), titleEn: "Too Late" });
    const { bot, calls } = testBot({ now: () => now });
    await bot.handleUpdate(textUpdate(520, "/weekend"));

    expect(sentTexts(calls)[0]).toBe(t("en", "bot.weekend.title"));
    const cards = calls.filter((c) => c.method === "sendPhoto");
    expect(cards).toHaveLength(1);
    const card = cards[0]!.payload;
    expect(card.photo).toBe(`https://dinkuan.test/posters/${event.slug}`);
    expect(card.caption).toContain("Ethio Jazz Weekend");
    expect(card.caption).toContain("📍 Fendika");
    // All-in price of the cheapest public tier: 500 Br + 5% + 10 Br fee.
    expect(card.caption).toContain("From 535 Br");

    const button = card.reply_markup.inline_keyboard[0][0];
    expect(button.text).toBe(t("en", "bot.card.buy"));
    const url = new URL(button.web_app.url);
    expect(url.origin + url.pathname).toBe("https://dinkuan.test/tg/login");
    expect(url.search).toContain(`next=%2Fe%2F${event.slug}%23tickets`);
    const token = url.searchParams.get("token")!;
    const stored = await prisma.telegramLoginToken.findUniqueOrThrow({ where: { tokenHash: sha256(token) } });
    expect(stored.userId).toBe(user.id);
    expect((await redeemTelegramLoginToken(token))?.userId).toBe(user.id);
  });

  it("F7-AC2: /tonight shows tonight's events, titled in the user's language", async () => {
    const now = new Date();
    await makeUser({ chatId: 521 });
    await makeEvent({ startsAt: inWindow("today", now), titleAm: "የዛሬ ምሽት ኮንሰርት" });
    const { bot, calls } = testBot({ now: () => now });
    await bot.handleUpdate(textUpdate(521, "/tonight"));
    expect(sentTexts(calls)[0]).toBe(t("am", "bot.tonight.title"));
    expect(calls.find((c) => c.method === "sendPhoto")!.payload.caption).toContain("የዛሬ ምሽት ኮንሰርት");
  });

  it("F7-AC2: with nothing on, /tonight says so", async () => {
    const { bot, calls } = testBot();
    await bot.handleUpdate(textUpdate(522, "/tonight"));
    expect(sentTexts(calls)).toEqual([t("am", "bot.tonight.empty")]);
  });

  it("F7-AC2: an unlinked chat gets cards whose Buy asks for the phone first", async () => {
    const now = new Date();
    const { event } = await makeEvent({ startsAt: inWindow("weekend", now) });
    const { bot, calls } = testBot({ now: () => now });
    await bot.handleUpdate(textUpdate(523, "/weekend"));
    const button = calls.find((c) => c.method === "sendPhoto")!.payload.reply_markup.inline_keyboard[0][0];
    expect(button.callback_data).toBe(`buy:${event.id}`);
    expect(await prisma.telegramLoginToken.count()).toBe(0);
    expect(sentTexts(calls).at(-1)).toBe(t("am", "bot.linkPrompt"));

    await bot.handleUpdate(callbackUpdate(523, `buy:${event.id}`));
    expect(sentTexts(calls).at(-1)).toBe(t("am", "bot.buy.linkFirst"));
    // Once linked, the same button opens checkout with a signed link.
    await bot.handleUpdate(contactUpdate(523, { phone: "+251922334455", userId: 523 }));
    await bot.handleUpdate(callbackUpdate(523, `buy:${event.id}`));
    const open = calls.at(-1)!.payload.reply_markup.inline_keyboard[0][0];
    expect(open.web_app.url).toContain("/tg/login?token=");
  });

  it("F7-AC2: if Telegram can't fetch the poster the card is sent as text", async () => {
    const now = new Date();
    await makeUser({ chatId: 524, lang: "en" });
    await makeEvent({ startsAt: inWindow("weekend", now), titleEn: "No Poster" });
    const { bot, calls } = testBot({ now: () => now }, (method) =>
      method === "sendPhoto" ? { error_code: 400, description: "Bad Request: wrong file identifier/HTTP URL specified" } : null,
    );
    await bot.handleUpdate(textUpdate(524, "/weekend"));
    const card = calls.filter((c) => c.method === "sendMessage")[1]!.payload;
    expect(card.text).toContain("No Poster");
    expect(card.reply_markup.inline_keyboard[0][0].web_app.url).toContain("/tg/login?token=");
  });
});

describe("F7 /mytickets", () => {
  it("F7-AC1: /mytickets lists valid upcoming tickets with a signed link to the wallet", async () => {
    const user = await makeUser({ chatId: 530, lang: "en" });
    const { event, ticketType } = await makeEvent({ startsAt: new Date(Date.now() + 48 * 3600_000), titleEn: "Azmari Night" });
    await buyTickets(user.id, event.id, ticketType.id, 2);
    const { bot, calls } = testBot();
    await bot.handleUpdate(textUpdate(530, "/mytickets"));
    const reply = calls.find((c) => c.method === "sendMessage")!.payload;
    expect(reply.text).toContain(t("en", "bot.mytickets.title"));
    expect(reply.text).toContain("Azmari Night");
    expect(reply.text).toContain("2 × Regular");
    const url = new URL(reply.reply_markup.inline_keyboard[0][0].web_app.url);
    expect(url.searchParams.get("next")).toBe("/tickets");
  });

  it("F7-AC1: /mytickets with no tickets says so", async () => {
    await makeUser({ chatId: 531 });
    const { bot, calls } = testBot();
    await bot.handleUpdate(textUpdate(531, "/mytickets"));
    expect(sentTexts(calls)).toEqual([t("am", "bot.mytickets.empty")]);
  });
});
