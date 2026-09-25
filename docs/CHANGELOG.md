# Changelog

## Demo milestone 1: core ticket demo

Built in demo mode so the platform can be shown before gateway and SMS contracts are signed.

- Monorepo (pnpm + Turborepo): `apps/web`, `apps/scanner`, `packages/db`, `core`, `payments`, `i18n`. The social, marketplace, ads, moderation and media packages come in later milestones.
- Prisma schema for events and tickets (PRD 5) with an append-only ledger trigger and an inventory check constraint.
- F1 phone + OTP login (fixed demo code `123456`), 30-day sessions, Amharic/English.
- F4 home (Featured, Tonight, This weekend, Upcoming, categories), search in Amharic and English, filters, event page with all-in price, Ethiopian calendar date, save and share with Open Graph previews.
- F5 checkout: 10-minute reservations with row locks, order state machine, idempotent webhook inbox, server-side verify, reconciliation, paid-after-expiry refunds. Telebirr and Chapa run through a demo gateway behind the same `PaymentGateway` interface.
- F6 tickets: per-event Ed25519 keys (encrypted at rest), signed QR codes rotating every 30 seconds, static fallback, offline wallet.
- F8 scanner PWA: offline pack, on-device verification, first-scan-wins sync across gates, manual search, live counter.
- Seed data: 8 Addis venues, 2 organisers, 9 events with tiers, demo accounts.

Not yet built: organiser dashboard and event creation (F2, F3, F11), Telegram bot (F7), refunds UI and payouts (F9, F11), promoter links (F10), admin (F12), notifications (F13), ticket transfer (F6-AC5), and everything in the social and marketplace pillars.

- Hosting prep: Vercel + Neon guide (docs/DEPLOY.md), nightly demo-database workflow, Vercel cron for reconciliation, and checkouts now release lapsed holds on the same event.
