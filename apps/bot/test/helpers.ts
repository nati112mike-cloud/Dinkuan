import { markOrderPaid, startCheckout } from "@dinkuan/core/server";
import { prisma } from "@dinkuan/db";
import { Api } from "grammy";
import type { Update, UserFromGetMe } from "grammy/types";
import { createBot, type BotOptions } from "../src";

export async function resetDb() {
  // ledger_entries blocks DELETE via trigger, so TRUNCATE everything.
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

let counter = 0;
export async function makeUser(opts: { name?: string; chatId?: number; lang?: "am" | "en" } = {}) {
  counter += 1;
  const phone = `+2519${String(20000000 + counter).slice(-8)}`;
  return prisma.user.create({
    data: {
      phone,
      name: opts.name ?? "Test Buyer",
      lang: opts.lang ?? "am",
      telegramChatId: opts.chatId === undefined ? null : String(opts.chatId),
      roles: { create: { role: "buyer" } },
    },
  });
}

export async function makeEvent(opts: { startsAt: Date; titleEn?: string; titleAm?: string; price?: number }) {
  counter += 1;
  const owner = await prisma.user.create({ data: { phone: `+2517${String(30000000 + counter).slice(-8)}`, name: "Organiser" } });
  const organiser = await prisma.organiser.create({
    data: { ownerUserId: owner.id, name: "Test Org", type: "business", status: "approved" },
  });
  const venue = await prisma.venue.create({ data: { name: "Fendika", address: "Kazanchis", lat: 9.0, lng: 38.7 } });
  const slug = `ev-${Math.random().toString(36).slice(2, 10)}`;
  const event = await prisma.event.create({
    data: {
      organiserId: organiser.id,
      slug,
      titleEn: opts.titleEn ?? "Jazz Night",
      titleAm: opts.titleAm ?? "የጃዝ ምሽት",
      category: "concert",
      posterUrl: `/posters/${slug}`,
      venueId: venue.id,
      startsAt: opts.startsAt,
      status: "published",
      ticketTypes: { create: { name: "Regular", priceSantim: opts.price ?? 50000, capacity: 100 } },
    },
    include: { ticketTypes: true },
  });
  return { event, ticketType: event.ticketTypes[0]! };
}

/** Buys and pays (as a verified gateway callback would) `qty` tickets. */
export async function buyTickets(userId: string, eventId: string, ticketTypeId: string, qty: number) {
  const { order } = await startCheckout({ userId, eventId, items: [{ ticketTypeId, qty }], gateway: "telebirr" });
  await markOrderPaid(order.id, { source: "verify" });
  return order;
}

export const botInfo: UserFromGetMe = {
  id: 4242,
  is_bot: true,
  first_name: "Dinkuan",
  username: "dinkuan_test_bot",
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
  can_manage_bots: false,
  supports_join_request_queries: false,
};

export interface ApiCall {
  method: string;
  // The Telegram payload shape depends on the method; tests read the fields they check.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
}

type Fail = (method: string, payload: unknown) => { error_code: number; description: string } | null;

/**
 * Replaces the network: every Telegram API call is recorded and answered locally, so tests
 * never talk to Telegram. `fail` can make chosen calls return a Telegram error.
 */
export function mockApi<T extends { config: Api["config"] }>(api: T, fail?: Fail) {
  const calls: ApiCall[] = [];
  api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload });
    const err = fail?.(method, payload);
    if (err) return { ok: false, ...err } as never;
    return { ok: true, result: true } as never;
  });
  return calls;
}

export function testBot(opts: BotOptions = {}, fail?: Fail) {
  const bot = createBot("123456:TEST-TOKEN", { botInfo, ...opts });
  const calls = mockApi(bot.api, fail);
  return { bot, calls };
}

export function testApi(fail?: Fail) {
  const api = new Api("123456:TEST-TOKEN");
  return { api, calls: mockApi(api, fail) };
}

let updateId = 0;
function chat(chatId: number) {
  return { id: chatId, type: "private" as const, first_name: "Selam" };
}
function from(userId: number) {
  return { id: userId, is_bot: false, first_name: "Selam" };
}

export function textUpdate(chatId: number, text: string): Update {
  updateId += 1;
  const command = text.startsWith("/") ? text.split(" ")[0]! : null;
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: chat(chatId),
      from: from(chatId),
      text,
      ...(command ? { entities: [{ type: "bot_command", offset: 0, length: command.length }] } : {}),
    },
  };
}

export function contactUpdate(chatId: number, contact: { phone: string; userId?: number }): Update {
  updateId += 1;
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: chat(chatId),
      from: from(chatId),
      contact: { phone_number: contact.phone, first_name: "Selam", ...(contact.userId ? { user_id: contact.userId } : {}) },
    },
  };
}

export function callbackUpdate(chatId: number, data: string): Update {
  updateId += 1;
  return {
    update_id: updateId,
    callback_query: {
      id: `cb${updateId}`,
      from: from(chatId),
      chat_instance: "ci",
      data,
      message: { message_id: 1, date: Math.floor(Date.now() / 1000), chat: chat(chatId), text: "…" },
    },
  };
}

/** Texts the bot sent (sendMessage text or photo captions), in order. */
export function sentTexts(calls: ApiCall[]): string[] {
  return calls
    .filter((c) => c.method === "sendMessage" || c.method === "sendPhoto")
    .map((c) => (c.payload.text ?? c.payload.caption ?? "") as string);
}
