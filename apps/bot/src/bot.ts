import { eventDateRange, maskPhone } from "@dinkuan/core";
import { appUrl, createTelegramLoginLink, linkTelegramChat, userForTelegramChat } from "@dinkuan/core/server";
import { prisma, type User } from "@dinkuan/db";
import { DEFAULT_LANG, isLang, translator, type Lang, type MessageKey } from "@dinkuan/i18n";
import { Bot, GrammyError, InlineKeyboard, Keyboard, type Context } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { absoluteUrl, eventTitle, formatDate, formatTime, priceLine } from "./format";

export interface BotOptions {
  /** Skips the getMe call on start-up (tests pass a fixed one). */
  botInfo?: UserFromGetMe;
  /** Clock, for tests. */
  now?: () => Date;
}

export interface DinkuanFlavor {
  /** The linked account for this chat, if any. */
  user: User | null;
  lang: Lang;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}
export type BotContext = Context & DinkuanFlavor;
export type TelegramBot = Bot<BotContext>;

/** Events shown per /tonight or /weekend, so the chat doesn't fill up. */
export const MAX_CARDS = 5;

export const BOT_COMMANDS = ["start", "weekend", "tonight", "mytickets", "language", "help"] as const;

/** Command menu for Telegram's setMyCommands, per language. */
export function commandMenu(lang: Lang) {
  const t = translator(lang);
  return BOT_COMMANDS.map((command) => ({ command, description: t(`bot.cmd.${command}`) }));
}

/** Telegram opens https links as a Web App inside the chat; anything else (local dev) as a normal link. */
export function openButton(label: string, url: string): InlineKeyboard {
  return url.startsWith("https://") ? new InlineKeyboard().webApp(label, url) : new InlineKeyboard().url(label, url);
}

function contactKeyboard(ctx: BotContext) {
  return new Keyboard().requestContact(ctx.t("bot.sharePhone")).resized().oneTime();
}

/**
 * F7: the ድንኳን Telegram bot. Commands /start /weekend /tonight /mytickets /language /help (AC1),
 * event cards with a Buy button that opens checkout already signed in (AC2), replies in the
 * person's language (AC5). Ticket delivery and reminders (AC3/AC4) go through the outbox; see
 * createOutboxSender.
 */
export function createBot(token: string, opts: BotOptions = {}): Bot<BotContext> {
  const bot = new Bot<BotContext>(token, opts.botInfo ? { botInfo: opts.botInfo } : undefined);
  const now = opts.now ?? (() => new Date());
  // Language picked before linking a phone. In memory only: linking saves it on the account.
  const guestLang = new Map<number, Lang>();

  const setLang = (ctx: BotContext, lang: Lang) => {
    ctx.lang = lang;
    ctx.t = translator(lang);
  };

  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.type === "private" ? ctx.chat.id : undefined;
    ctx.user = chatId === undefined ? null : await userForTelegramChat(String(chatId));
    setLang(ctx, ctx.user?.lang ?? (chatId === undefined ? undefined : guestLang.get(chatId)) ?? DEFAULT_LANG);
    await next();
  });

  // Only private chats: tickets and sign-in links must never land in a group.
  const pm = bot.chatType("private");

  pm.command("start", async (ctx) => {
    if (ctx.user) {
      await ctx.reply(`${ctx.t("bot.welcome")}\n\n${ctx.t("bot.alreadyLinked")}`, { reply_markup: { remove_keyboard: true } });
      return;
    }
    await ctx.reply(`${ctx.t("bot.welcome")}\n\n${ctx.t("bot.linkPrompt")}`, { reply_markup: contactKeyboard(ctx) });
  });

  pm.command("help", (ctx) => ctx.reply(ctx.t("bot.help")));

  pm.on("message:contact", async (ctx) => {
    const contact = ctx.message.contact;
    // Only the sender's own number proves who they are (Telegram verified it by SMS).
    if (contact.user_id !== ctx.from.id) {
      await ctx.reply(ctx.t("bot.notOwnContact"), { reply_markup: contactKeyboard(ctx) });
      return;
    }
    const res = await linkTelegramChat(contact.phone_number, String(ctx.chat.id));
    if (!res.ok) {
      await ctx.reply(ctx.t("bot.invalidPhone"), { reply_markup: contactKeyboard(ctx) });
      return;
    }
    let user = res.user;
    const picked = guestLang.get(ctx.chat.id);
    if (picked && picked !== user.lang) user = await prisma.user.update({ where: { id: user.id }, data: { lang: picked } });
    guestLang.delete(ctx.chat.id);
    ctx.user = user;
    setLang(ctx, user.lang);
    await ctx.reply(ctx.t("bot.linked", { phone: maskPhone(user.phone) }), { reply_markup: { remove_keyboard: true } });
    await ctx.reply(ctx.t("bot.help"));
  });

  pm.command("tonight", (ctx) => sendEvents(ctx, "today"));
  pm.command("weekend", (ctx) => sendEvents(ctx, "weekend"));
  pm.command("mytickets", (ctx) => sendMyTickets(ctx));
  pm.callbackQuery("mytickets", async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendMyTickets(ctx);
  });

  pm.command("language", (ctx) =>
    ctx.reply(ctx.t("bot.language.prompt"), {
      reply_markup: new InlineKeyboard().text(ctx.t("bot.language.am"), "lang:am").text(ctx.t("bot.language.en"), "lang:en"),
    }),
  );
  pm.callbackQuery(/^lang:(am|en)$/, async (ctx) => {
    const lang = ctx.match[1];
    if (!isLang(lang)) return;
    await ctx.answerCallbackQuery();
    if (ctx.user) ctx.user = await prisma.user.update({ where: { id: ctx.user.id }, data: { lang } });
    else guestLang.set(ctx.chat.id, lang);
    setLang(ctx, lang);
    await ctx.reply(ctx.user ? ctx.t("bot.language.set") : `${ctx.t("bot.language.set")}\n${ctx.t("bot.language.saveHint")}`);
  });

  pm.callbackQuery(/^buy:([0-9a-f-]{36})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!ctx.user) {
      await ctx.reply(ctx.t("bot.buy.linkFirst"), { reply_markup: contactKeyboard(ctx) });
      return;
    }
    const event = await prisma.event.findUnique({ where: { id: ctx.match[1] } });
    if (!event || event.status !== "published") {
      await ctx.reply(ctx.t("bot.error"));
      return;
    }
    const link = await createTelegramLoginLink(ctx.user.id, `/e/${event.slug}#tickets`, now());
    await ctx.reply(ctx.t("bot.buy.open", { title: eventTitle(event, ctx.lang) }), {
      reply_markup: openButton(ctx.t("bot.card.buy"), link),
    });
  });

  pm.on("message", (ctx) => ctx.reply(ctx.t("bot.unknown")));

  bot.catch(async (err) => {
    console.error("[bot]", err.error);
    await err.ctx.reply(err.ctx.t?.("bot.error") ?? translator(DEFAULT_LANG)("bot.error")).catch(() => undefined);
  });

  async function sendEvents(ctx: BotContext, filter: "today" | "weekend") {
    const range = eventDateRange(filter, now());
    const events = await prisma.event.findMany({
      where: { status: "published", startsAt: { gte: range.from, ...(range.to ? { lt: range.to } : {}) } },
      include: { venue: true, ticketTypes: { orderBy: { sortOrder: "asc" } } },
      orderBy: [{ featured: "desc" }, { startsAt: "asc" }],
      take: MAX_CARDS,
    });
    const key = filter === "today" ? "tonight" : "weekend";
    if (!events.length) {
      await ctx.reply(ctx.t(`bot.${key}.empty`));
      return;
    }
    await ctx.reply(ctx.t(`bot.${key}.title`));
    for (const e of events) {
      const caption = [
        eventTitle(e, ctx.lang),
        `🗓 ${formatDate(e.startsAt, ctx.lang)} · ${formatTime(e.startsAt, ctx.lang)}`,
        `📍 ${e.venue.name}`,
        priceLine(e, ctx.lang),
      ]
        .filter(Boolean)
        .join("\n");
      const label = ctx.t("bot.card.buy");
      // Linked: a one-time signed sign-in link straight to the ticket picker. Not linked: ask for the phone first.
      const link = ctx.user ? await createTelegramLoginLink(ctx.user.id, `/e/${e.slug}#tickets`, now()) : null;
      const keyboard = link ? openButton(label, link) : new InlineKeyboard().text(label, `buy:${e.id}`);
      await sendCard(ctx, absoluteUrl(e.posterUrl, appUrl()), caption, keyboard, link);
    }
    if (!ctx.user) await ctx.reply(ctx.t("bot.linkPrompt"), { reply_markup: contactKeyboard(ctx) });
  }

  async function sendMyTickets(ctx: BotContext) {
    if (!ctx.user) {
      await ctx.reply(ctx.t("bot.linkPrompt"), { reply_markup: contactKeyboard(ctx) });
      return;
    }
    const at = now();
    const tickets = await prisma.ticket.findMany({
      where: {
        holderUserId: ctx.user.id,
        status: "valid",
        event: { OR: [{ endsAt: { gt: at } }, { endsAt: null, startsAt: { gt: at } }] },
      },
      include: { event: { include: { venue: true } }, ticketType: true },
      orderBy: [{ event: { startsAt: "asc" } }, { ticketType: { sortOrder: "asc" } }],
    });
    if (!tickets.length) {
      await ctx.reply(ctx.t("bot.mytickets.empty"));
      return;
    }
    const blocks = new Map<string, { head: string; types: Map<string, number> }>();
    for (const tk of tickets) {
      const b = blocks.get(tk.eventId) ?? {
        head: [
          eventTitle(tk.event, ctx.lang),
          `🗓 ${formatDate(tk.event.startsAt, ctx.lang)} · ${formatTime(tk.event.startsAt, ctx.lang)}`,
          `📍 ${tk.event.venue.name}`,
        ].join("\n"),
        types: new Map<string, number>(),
      };
      b.types.set(tk.ticketType.name, (b.types.get(tk.ticketType.name) ?? 0) + 1);
      blocks.set(tk.eventId, b);
    }
    const body = [...blocks.values()]
      .map((b) => [b.head, ...[...b.types].map(([type, count]) => `🎟 ${ctx.t("bot.mytickets.line", { count, type })}`)].join("\n"))
      .join("\n\n");
    const link = await createTelegramLoginLink(ctx.user.id, "/tickets", at);
    await ctx.reply(`${ctx.t("bot.mytickets.title")}\n\n${body}`, {
      reply_markup: openButton(ctx.t("bot.mytickets.open"), link),
    });
  }

  return bot;
}

/**
 * Sends an event card as a poster photo. Telegram must be able to fetch the poster, so if it
 * can't (e.g. APP_URL is localhost) the card goes as text; if the button is refused too (a
 * non-https link), the link goes in the text instead.
 */
async function sendCard(ctx: BotContext, photo: string, caption: string, keyboard: InlineKeyboard, link: string | null) {
  try {
    await ctx.replyWithPhoto(photo, { caption, reply_markup: keyboard });
    return;
  } catch (e) {
    if (!(e instanceof GrammyError)) throw e;
  }
  try {
    await ctx.reply(caption, { reply_markup: keyboard });
  } catch (e) {
    if (!(e instanceof GrammyError) || !link) throw e;
    await ctx.reply(`${caption}\n\n${link}`);
  }
}
