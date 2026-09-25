# BUILD_PROMPTS.md — Session-by-session plan for Claude Code

Put `PRD.md`, `CLAUDE.md` and this file in the repo root. Run **one slice per session**. Paste the prompt, approve the plan, let it build, then check the "Done when" list yourself before moving on.

Tip: start each session with *"Read CLAUDE.md and PRD.md first."* and use plan mode for slices 1–6.

---

## Slice 0 — Foundation (day 1–2)
```
Read CLAUDE.md and PRD.md. Set up the ድንኳን (dinkuan) monorepo exactly as described in CLAUDE.md "Stack":
pnpm + Turborepo, apps/web (Next.js), apps/scanner (Vite React PWA), apps/bot (grammY),
packages db/core/payments/i18n/ui/social/marketplace/ads/moderation/media. Add ESLint, Prettier, TypeScript strict, Vitest, Playwright,
docker-compose for Postgres + Redis, .env.example, and a GitHub Actions CI running lint,
typecheck and tests. Create the full Prisma schema from PRD section 5 with migrations and a seed
script (2 organisers, 6 events in Addis venues, ticket types). Add money helpers (santim) and
Ethiopian calendar conversion in packages/core with tests. Show me the plan first.
```
**Done when:** `pnpm dev` runs all apps · CI green · seed loads · money and Ethiopian date tests pass.

---

## Slice 1 — Auth & i18n (F1)
```
Implement F1 from PRD.md: phone + OTP login with all acceptance criteria (phone normalisation,
rate limits, expiry, attempts), 30-day sessions, language switch (am/en) persisted to profile,
and Telegram account linking via deep link. Use a pluggable SMS provider interface with a console
provider for development. Write a test for every F1 AC. Plan first.
```
**Done when:** you can log in with a test number in Amharic and English · all F1 tests pass.

---

## Slice 2 — Organisers & events (F2, F3)
```
Implement F2 and F3 from PRD.md: organiser application + admin approval, team members
(manager/scanner), event creation wizard (details → tickets → review), ticket types with tiers,
event states, poster upload with WebP resizing, the price-edit lock, and admin review for new
organisers. Mobile-first organiser UI. Tests for every F2 and F3 AC. Plan first.
```
**Done when:** an approved organiser can create and publish a paid event with 3 ticket tiers from a phone.

---

## Slice 3 — Discovery (F4)
```
Implement F4: home feed (Featured, Tonight, This Weekend, Upcoming, by Category), filters,
bilingual search, event page with all-in price and fee breakdown, save events, and share links
with Open Graph previews (poster + title). Must load fast on 3G: optimise images and use
server rendering. Tests for every F4 AC. Plan first.
```
**Done when:** a shared event link shows a proper preview in Telegram · the feed is usable on a cheap Android phone.

---

## Slice 4 — Checkout & payments (F5) ⚠️ most critical
```
Implement F5 exactly per PRD.md and CLAUDE.md rules 1–6. Build packages/payments with a
PaymentGateway interface and two adapters: Chapa (hosted checkout, webhook signature verification,
verify endpoint, refund) and Telebirr H5 C2B (signed requests, notify callback verification, query).
Implement the 10-minute inventory reservation with row locks, the order state machine, the
idempotent webhook inbox (PaymentEvent), the reconciliation job every 10 minutes, and the
"paid after expiry" edge cases. Use sandbox credentials and full mocks for tests. Write tests for
every F5 AC, including concurrency: 50 buyers racing for the last 10 tickets must never oversell.
Plan first and list any gateway details you need from me.
```
**Done when:** sandbox payment → order paid via webhook only · duplicate webhook creates no duplicate tickets · race test passes.

---

## Slice 5 — Tickets & wallet (F6)
```
Implement F6: ticket issuance on payment, per-event Ed25519 keys (private key encrypted at rest),
signed QR payloads with version, rotating QR every 30 seconds in the app, static QR for
Telegram/SMS, an offline-cached wallet (upcoming/past), and ticket transfer by phone with version
increment and limits. Tests for every F6 AC, including "old QR invalid after transfer".
Plan first.
```
**Done when:** a ticket shows offline in airplane mode · a transferred ticket's old QR fails verification.

---

## Slice 6 — Scanner app (F8)
```
Implement F8 in apps/scanner: scanner login, event selection, offline pack download (public key +
ticket list), fully local verification (signature, time window, version, status), a big
green/red result with reasons in under 1 second, a local check-in queue with background sync and
multi-gate conflict handling (first scan wins), manual search and a live counter. Must work with
zero internet for a whole event. Tests for every F8 AC, including two gates scanning the same
ticket offline. Plan first.
```
**Done when:** in airplane mode, 200 scans work, duplicates are rejected, and everything syncs correctly when back online.

---

## Slice 7 — Telegram bot (F7)
```
Implement F7 in apps/bot: commands /start /weekend /tonight /mytickets /language /help, event cards
with a Buy button opening checkout as a Telegram Web App, ticket delivery (QR image) after
payment, and reminders at 24h and 3h via BullMQ. Bilingual replies. Tests for every F7 AC.
```
**Done when:** a full purchase happens inside Telegram and the ticket arrives in the chat.

---

## Slice 8 — Refunds, promoters, dashboard, payouts (F9, F10, F11)
```
Implement F9 (refund policies, automatic refunds on cancellation via gateway, admin
full/partial refunds, refund_pending queue), F10 (promoter links with attribution, promo codes)
and F11 (organiser live stats, attendee CSV with consent rules, append-only ledger, payout
requests with hold rules). Tests for every AC, including ledger balance consistency after mixed
sales, refunds and payouts.
```
**Done when:** cancelling an event refunds everyone in sandbox · ledger totals match orders exactly.

---

## Slice 9 — Admin & notifications (F12, F13)
```
Implement F12 admin panel (queues, featuring, fee overrides, fraud flags, audit log viewer) and
F13 notifications on all listed triggers via Telegram, SMS and email with templates in am/en.
Tests for every AC.
```

---

## Slice 10 — Profiles, follow & media pipeline (F14 + media)
```
Implement F14 (public profiles, @usernames, follow/unfollow, private accounts, block, mute,
badges, share links) and the media pipeline in packages/media: resumable uploads (tus),
client-side compression, sharp image variants with blurhash, ffmpeg workers transcoding video
to HLS 240p/360p/720p with thumbnails, and the processing → screening → public state machine
(screening can be a stub adapter for now). Tests for every F14 AC and for the upload pipeline
on an interrupted connection. Plan first.
```
**Done when:** a 2-minute video uploaded on a throttled connection resumes after a drop and plays in HLS.

---

## Slice 11 — Posts, feed, reels & engagement (F15, F16)
```
Implement F15 and F16: post types (text, photo carousel, video, meme editor), event/venue/people
tags and hashtags, the For You / Following / Events feeds with ranking v1 exactly as F16-AC6,
full-screen reels player with preloading and low-data mode, reactions, comments with replies,
pins, reposts, external share, saves, and watch-time tracking. Event pages get a "Moments" tab.
Use cursor pagination and denormalised counters (CLAUDE.md rules 18–19). Seed 100k posts and
prove p95 < 300 ms. Tests for every AC. Plan first.
```
**Done when:** reels swipe smoothly on a mid-range Android · low-data mode cuts data use visibly · feed load test passes.

---

## Slice 12 — Find people & notifications (F17 + social part of F13)
```
Implement F17: onboarding interests with at least 10 follow suggestions, opt-in hashed contact
sync, suggestions (same events, mutuals, popular in Addis), bilingual people search with
Meilisearch, invite with referral codes, and profile QR codes. Add the social notifications from
F13 with batching. Tests for every AC, including that raw contact numbers are never stored.
```

---

## Slice 13 — Moderation & trust (F22)
```
Implement F22 end to end: guideline acceptance, a real screening adapter for images/video and
text (keyword lists for Amharic, Afaan Oromo and English plus a pluggable ML provider), report
flows on every content type, the moderator web queue with severity sorting, actions, strikes,
appeals, rate limits, age rules and copyright takedown. Everything audit-logged. Tests for every
AC. Plan first.
```
**Done when:** a flagged upload never becomes public · 3 strikes auto-suspend · moderators can clear the queue from the web panel.

---

## Slice 14 — Vendor marketplace, Phase 1 (F20 AC1–AC15)
```
Implement F20 AC1–AC15: vendor pro profiles for all vendor types, portfolio albums with
verified-gig tagging (organiser confirms), stage credits, Basic/Standard/Premium packages with
add-ons, availability calendar, search with all filters and sorts, compare up to 3, shortlists
shareable on Telegram, booking requests, and in-app chat with contact masking (CLAUDE.md
rule 16, including Amharic digits). Do NOT build deposits or reviews yet (Phase 2).
Tests for every AC in scope. Plan first.
```
**Done when:** a client can find a DJ available on a date, compare 3, send a request and chat, and cannot see the phone number.

---

## Slice 15 — Promotion packages, Phase 1 (F21 packages)
```
Implement the Phase 1 part of F21: the ready-made packages (AC3) bought via the gateway on
events, posts, profiles and vendor packages, ad review queue, "Sponsored · ማስታወቂያ" labels,
placement slots in feed, reels, Events featured, Home weekend and marketplace search top,
frequency caps, basic results (impressions, clicks, conversions) and refunds of unspent
budget. Build the placement and impression tracking so the Phase 2 CPM wizard can reuse it.
Tests for every AC in scope.
```
**Done when:** an organiser buys "Event Spotlight", it passes review, shows labelled in the right slots, and the results page counts ticket sales from it.

---

## Slice 16 — Hardening & launch readiness
```
Do a launch-readiness pass: load test feed/reels at 5,000 concurrent users and video delivery costs per 1,000 views, security review (auth, role checks on every route, rate limits,
webhook verification, secret handling), load test checkout at 500 concurrent buyers, e2e
Playwright tests for the buyer, organiser and scanner flows, error tracking, structured logs,
database backups, a privacy policy and terms page in am/en, a data export/delete endpoint (PDPP),
and a production deployment guide. List every issue you find with severity before fixing.
```
**Done when:** the e2e suite is green · load test passes · you run a real pilot event with a partner promoter.

---

## Rules while building
- Never say "fix everything"; point to the failing AC: *"F5-AC7 fails: duplicate webhook created 2 tickets. Fix it and add a regression test."*
- If you change your mind about a feature, **edit PRD.md first**, then prompt.
- Commit after every slice; tag releases (`v0.1-slice4`).
- Phase 2 slices (gifting, booking deposits & reviews, boost wizard, live, DMs, invitations): before coding each one, ask Claude to re-read the PRD section, list any gaps, and update PRD.md first.
