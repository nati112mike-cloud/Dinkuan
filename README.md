# ድንኳን (Dinkuan)

Addis Ababa's social events platform: events and tickets, social posts and reels, and a marketplace for the people who make events happen.

- `PRD.md`: what we build
- `CLAUDE.md`: how we build it
- `BUILD_PROMPTS.md`: build order
- `docs/CHANGELOG.md`: what has been built so far

## Demo mode

Payment gateway and SMS contracts are still being signed, so the app runs in **demo mode** (`DEMO_MODE=true`):

- Telebirr and Chapa checkout go to a clearly labelled simulated payment page. The order is still only marked paid through the normal signed-webhook and server-verify path, so switching to the real gateways later means filling in `packages/payments/src/telebirr.ts` and `chapa.ts`, not rewriting checkout.
- Login codes are not sent by SMS; the code is always `123456`.
- A banner on every page says payments are simulated.

Demo accounts (code `123456`; on a shared demo the admin uses `DEMO_STAFF_CODE` instead):

| Phone | Role |
|---|---|
| 0911000001 | Buyer (Hanna, @hanna.t, follows a few creators) |
| 0911000002 | Gate scanner for both demo organisers |
| 0911000003 | Organiser (Addis Nights Entertainment): dashboard and new events at /organiser |
| 0911000004 | Admin: review queues, fraud flags, featured events and audit log at /admin |
| 0911000006 | New organiser (Arat Kilo Comedy Club) with an event waiting for review |
| 0911000007 | Organiser application waiting for admin approval |
| 0911100001 | Pro DJ (DJ Kaleb, @djkaleb): vendor dashboard, requests and chat |

## Run it locally

Needs Node 22, pnpm 10 and PostgreSQL 16 (or `docker compose up -d`).

```bash
pnpm install
cp .env.example apps/web/.env.local       # then set KEY_ENCRYPTION_SECRET (openssl rand -base64 32)
cp .env.example packages/db/.env          # same values
echo "VITE_API_URL=http://localhost:3000" > apps/scanner/.env.local
pnpm db:deploy && pnpm db:seed
pnpm dev                                  # web on :3000, scanner on :5173
```

Re-run `pnpm db:seed` any time: it moves the demo events so "Tonight" and "This weekend" always have something on, and moves the demo posts forward so the feed looks fresh. The seed includes 16 fictional Addis creators, posts, placeholder reels and event Moments, 12 pros to hire with packages and calendars, and 3 live promotions.

Hosting the demo online: see `docs/DEPLOY.md`.

## Telegram bot

`apps/bot` (grammY) is the ድንኳን bot (PRD F7): `/start` links the chat to an account by sharing the phone number with Telegram's contact button, `/tonight` and `/weekend` send event cards (poster, Addis date and time, venue, all-in "from" price) with a **Buy tickets** button that opens checkout as a Telegram Web App already signed in (a one-time link, valid 15 minutes), `/mytickets` lists upcoming tickets, `/language` switches Amharic/English and `/help` lists commands. After payment each ticket arrives as a QR image (the wallet's static fallback code), and holders get reminders 24 hours and 3 hours before the event.

Everything works without a bot: with no `TELEGRAM_BOT_TOKEN` the Telegram routes answer 404 and tickets simply aren't sent to Telegram.

1. In Telegram, message [@BotFather](https://t.me/BotFather): `/newbot`, pick a name (ድንኳን) and a username ending in `bot`. Copy the token.
2. Set the env vars (web app and bot): `TELEGRAM_BOT_TOKEN` (the token), `TELEGRAM_WEBHOOK_SECRET` (`openssl rand -hex 32`), `TELEGRAM_BOT_USERNAME` (without the @, for the "Connect Telegram" row in settings). `APP_URL` must be the public **https** address: Telegram only opens https links as Web Apps and must be able to fetch the posters.
3. Production (webhook): deploy, then run `pnpm --filter @dinkuan/bot set-webhook` with the same env (exported, or in `apps/web/.env.local`). It points Telegram at `${APP_URL}/api/telegram/webhook`, which only accepts calls carrying the secret, and sets the command menu in both languages. `--delete` removes the webhook.
4. Local development (long polling): `pnpm --filter @dinkuan/bot dev` (reads `apps/web/.env.local` and the repo `.env`). It removes any webhook and also delivers the outbox every 10 seconds, so a demo purchase arrives in the chat. For Buy buttons and posters to work, run the web app behind an https tunnel (e.g. `cloudflared tunnel --url http://localhost:3000`) and use that as `APP_URL`.

Ticket delivery and reminders go through an outbox table (`outbound_messages`): the order's transaction queues one message, the payment webhook and demo payment routes send it right after responding, and `/api/cron/telegram` (Vercel cron, `CRON_SECRET`) queues reminders and retries anything left. The demo's Vercel cron runs once a day (Hobby plan limit); on a paid plan run `/api/cron/telegram` every 10 to 15 minutes so the 3-hour reminders go out on time. With Redis these become BullMQ repeatable jobs.

## Checks

```bash
pnpm lint && pnpm typecheck && pnpm test   # unit + database integration tests
pnpm test:e2e                              # Playwright: buyer journey, offline gate scanning, social journey
pnpm --filter @dinkuan/social bench        # feed speed with 100k posts (wipes dinkuan_social_test)
```

Integration tests use separate `dinkuan_test` (core), `dinkuan_social_test` (social) and `dinkuan_bot_test` (Telegram bot) databases; the social and bot ones are created on first run. The bot tests never call Telegram: the API is mocked.
