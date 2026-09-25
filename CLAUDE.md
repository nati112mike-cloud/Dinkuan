# CLAUDE.md — Project rules for Claude Code

Read this file and `PRD.md` at the start of every session. `PRD.md` is the source of truth for **what** to build; this file says **how**.

## Project
**ድንኳን (Dinkuan)** is Addis Ababa's social events platform, built on three pillars:
1. Events and tickets: Telebirr-first checkout, Telegram delivery, offline QR check-in.
2. Social: posts, reels, comments, reactions, follows, gifting.
3. Marketplace and promotion: vendor pro profiles, bookings, boost packages.

Build only the features in the **current phase** of PRD section 7. Do not start later-phase features unless asked. In code, identifiers use `dinkuan`; the UI shows ድንኳን.

## Stack
- **Monorepo:** pnpm workspaces + Turborepo
  - `apps/web` — Next.js (App Router, TypeScript), buyer PWA + organiser + admin
  - `apps/scanner` — Vite + React PWA, offline-first (IndexedDB via Dexie)
  - `apps/bot` — Telegram bot (grammY, TypeScript)
  - `packages/db` — Prisma schema + migrations (PostgreSQL)
  - `packages/core` — domain logic: pricing, inventory, orders, tickets, QR signing, ledger
  - `packages/payments` — gateway adapters: `telebirr`, `chapa` behind one `PaymentGateway` interface
  - `packages/i18n` — Amharic + English message files
  - `packages/ui` — shared components (Tailwind + shadcn/ui)
  - `packages/social` — posts, feed ranking, follows, reactions, comments, notifications fan-out
  - `packages/marketplace` — vendor profiles, packages, availability, requests, offers, bookings, reviews
  - `packages/ads` — campaigns, placements, pacing, impressions, attribution
  - `packages/moderation` — screening pipeline, reports, actions, strikes
  - `packages/media` — uploads (tus resumable), image processing (sharp), video transcoding to HLS (ffmpeg workers)
- **Jobs:** BullMQ + Redis (reservation expiry, reconciliation, reminders, refunds, transcoding, screening, feed fan-out, ad pacing)
- **Search:** Meilisearch (people, events, vendors; Amharic + English)
- **Realtime:** WebSockets (chat, notifications, live gift animations)
- **Mobile app:** buyer/social experience as an installable PWA first (Next.js); the reels player uses hls.js. Add React Native later only if PWA limits show up.
- **Validation:** Zod on every API input and webhook payload
- **Tests:** Vitest (unit), Playwright (e2e), Testcontainers or a test DB for integration
- **Crypto:** Ed25519 via `@noble/ed25519` for QR signatures

## Non-negotiable rules
1. **Money is integer santim.** Never use floats for money. Use helpers in `packages/core/money.ts`.
2. **Payment status changes only via verified webhook or server-side verify call.** Never trust client redirects, query params or screenshots.
3. **Webhooks are idempotent:** write to `PaymentEvent` inbox first (unique constraint), then process inside a transaction.
4. **Platform never holds funds.** No user wallet balances or stored value. Refunds and payouts go through gateway APIs or manual admin payout records.
5. **Inventory changes happen in a DB transaction with row locks.** Never oversell.
6. **LedgerEntry is append-only.** Every sale, fee, refund and payout writes a ledger row.
7. **Every endpoint checks the role and ownership** (organiser can only touch their own events).
8. **No hard-coded UI text.** All strings go through `packages/i18n` with both `am` and `en` keys.
9. **Times stored in UTC**, displayed in `Africa/Addis_Ababa`. Ethiopian calendar conversion lives in `packages/core/ethiopianDate.ts`.
10. **Secrets only in env vars.** Never commit keys. Event private signing keys are encrypted at rest and never sent to any client.
11. **Audit-log** every admin action and every money-related state change.
12. **Personal data:** collect only what the PRD lists; log consent; phone numbers hidden from organisers unless consented.
13. **No stored-value wallets or coins.** Gifts, boosts and deposits are each paid in Birr through the gateway at the moment of purchase.
14. **No user content goes public before screening.** Uploads go `processing → screening → public | restricted | removed`.
15. **Every social query respects blocks, mutes, private accounts and removed content.** Put this filtering in one shared helper and test it.
16. **Contact info is masked in marketplace chat** until a deposit is paid (phone numbers, @handles, links, including Amharic digits and spelled-out numbers).
17. **Sponsored content is always labelled** and follows the frequency caps in F21.
18. **Counters (likes, views, followers) are denormalised and updated asynchronously**; never count rows on read in hot paths.
19. **Feed and reels endpoints use cursor pagination** and must respond in < 300 ms at p95 with seeded data of 100k posts.

## How to work
- **Plan first.** For each task, propose a short plan (files to touch, schema changes, tests) and wait for approval before large changes.
- **Build in vertical slices** following `BUILD_PROMPTS.md`. One slice at a time, fully working and tested.
- **Tests are part of done:** every acceptance criterion (AC) in the PRD for the slice gets at least one test. Name tests after the AC, e.g. `F5-AC6: redirect alone does not mark order paid`.
- Run `pnpm lint && pnpm typecheck && pnpm test` before saying a task is done. Fix failures; don't skip tests.
- Keep functions small; domain logic goes in `packages/core`, not in route handlers.
- When the PRD is ambiguous, **ask**, then suggest the PRD edit.
- Update `docs/CHANGELOG.md` with a short note after each slice.

## Conventions
- TypeScript strict mode. No `any` without a comment explaining why.
- File names: `kebab-case.ts`; React components: `PascalCase.tsx`.
- API routes under `apps/web/app/api/...`; return `{ data }` or `{ error: { code, message } }`.
- Error codes are stable strings (`SOLD_OUT`, `RESERVATION_EXPIRED`, `PAYMENT_UNVERIFIED`), translated in the UI.
- Prisma migrations are named descriptively (`add_ticket_transfers`).
- Mobile-first UI; test layouts at 360px wide.

## Commands
- `pnpm dev` — run all apps
- `pnpm db:migrate` — apply migrations
- `pnpm db:seed` — seed demo organisers, events and tickets
- `pnpm test` / `pnpm test:e2e`
- `pnpm lint` / `pnpm typecheck`

## Environment variables (see `.env.example`)
`DATABASE_URL`, `REDIS_URL`, `APP_URL`, `SESSION_SECRET`, `KEY_ENCRYPTION_SECRET`,
`TELEBIRR_APP_ID`, `TELEBIRR_APP_KEY`, `TELEBIRR_MERCHANT_CODE`, `TELEBIRR_PRIVATE_KEY`, `TELEBIRR_PUBLIC_KEY`, `TELEBIRR_BASE_URL`,
`CHAPA_SECRET_KEY`, `CHAPA_WEBHOOK_SECRET`, `CHAPA_BASE_URL`,
`TELEGRAM_BOT_TOKEN`, `SMS_PROVIDER_API_KEY`, `STORAGE_BUCKET`, `STORAGE_KEY`, `STORAGE_SECRET`

Use gateway **sandbox/test** credentials in development. Never call live payment endpoints from tests; use mocks in `packages/payments/__mocks__`.
