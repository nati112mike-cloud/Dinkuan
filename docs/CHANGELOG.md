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

## Demo milestone 2: social

- F14 profiles: usernames, Amharic display names, bio, link, sub-city, photo and cover, badges (verified, creator, organiser), counters, private accounts with follow requests, block and mute, share link with an Open Graph card, profile QR code.
- F15 posts: text, photo carousels (1–10), meme editor, video/reels (up to 3 minutes), event tags, hashtags and @mentions, followers-only audience, 24-hour caption edits, delete, drafts saved on the phone. Photos are shrunk on the phone and uploads resume after a dropped connection. Every post passes screening (demo stand-in: spam-link check) before it goes public.
- F16 feed: For You (engagement × recency × Addis locality × follow/same-event boost), Following, and the Events tab; full-screen reels with muted autoplay, tap to unmute, loop, progress, view counts, preloading of the next two, and low-data mode; reactions, one level of comment replies, comment likes, pin/hide/delete, keyword filter, share (copy link, Telegram, WhatsApp, repost) and saved collections; watch time tracking.
- F17: onboarding with interests and at least 10 suggestions, suggestions from same events/mutual follows/interests/popularity, people search in Amharic and English, invite links with referral tracking.
- F22-AC3 report button on posts, comments and profiles; F22-AC9 hourly rate limits on posts, comments and follows.
- One visibility helper for every social query (CLAUDE.md rule 15), tested for blocks, mutes, private accounts, followers-only posts and screening.
- Feed and reels use keyset cursors; `pnpm --filter @dinkuan/social bench` checks p95 < 300 ms with 100k posts (about 55 ms locally) and runs in CI.
- Seed: 16 fictional Addis creators, 24 posts, 8 placeholder reels and event Moments.

Demo shortcuts, to replace before launch: uploads are stored in Postgres (swap for object storage), videos are not transcoded (the seeded reels have a 240p copy for low-data mode), screening is a stub, and counters are updated in the same transaction rather than by a background job (rule 18). Contact sync (F17-AC2) and the invite reward are not built yet.

## Demo milestone 3: marketplace and promotion

- New main nav per PRD 6: Home · Reels · Create · Events · Hire. My tickets moved to the top of Events and to your profile; a 💬 inbox with an unread badge joined the header.
- F20 marketplace (Phase 1): pro profiles on top of social profiles (types, headline, experience, services, genres, languages, areas, equipment, team, links), levels (New, Rising, Top rated, Pro), portfolio albums tagged to ድንኳን events and confirmed by the organiser as verified gigs, stage credits, Basic/Standard/Premium packages with add-ons, an availability calendar, and a vendor dashboard.
- Hire search by type, date (only free vendors), price, rating, level, area, genre and language, with Recommended, Top rated, Lowest price and Most booked sorts; compare up to 3; shortlists shareable on Telegram.
- Booking requests (date, time, venue, event type, guests, package, budget, notes) open a chat. Phone numbers, links, emails and @handles are masked in requests and chat until a deposit is paid (rule 16), including Ethiopic and Arabic digits and numbers spelled out in English or Amharic. Response time and reply rate are tracked.
- Reviews are shown read-only from the seed; writing reviews, offers and deposits come in Phase 2.
- F21 promotion (Phase 1): Starter Boost, Event Spotlight, Weekend Takeover and Vendor Top Search, bought through the gateway with an estimated reach; Push Blast shows as coming soon. Paid promotions wait in an admin ad review queue (with an automatic content check), then run labelled "Sponsored · ማስታወቂያ" in the feed, reels, Featured events, Home "This weekend" and the top of Hire search. Each person sees a promotion at most 3 times a day, impression packages are paced evenly, and results show views, reach, clicks, click rate, ticket sales and booking requests (a click is remembered for 7 days). Rejected promotions are refunded in full and stopped ones refund the unspent share, through the gateway, with ledger rows and audit logs.
- Seed: 12 fictional pros (8 from the social seed, 4 new), packages, albums, stage credits, blocked dates and reviews, plus the promotion packages and 3 live demo promotions.
- E2E: `marketplace.spec` (find a free DJ, compare 3, request, chat with contacts masked) and `promotion.spec` (buy Event Spotlight, admin approves, labelled, a ticket sale counts, stop refunds). `E2E_WIDTH=360` runs them at the smallest phone width.

Demo shortcuts: Weekend Takeover's reels boost and Telegram channel post wait for the bot (M4), and vendor stats for the seeded pros stand in for bookings made before ድንኳን.

## Launch hardening 1: critical and high fixes from the audit

The audit is in `/mnt/project-files/reviews/launch-readiness-audit.md` (63 findings). This round fixes:
- S1: on a shared demo the admin signs in with a private `DEMO_STAFF_CODE` instead of 123456, and `APP_ENV=production` with `DEMO_MODE=true` refuses to run.
- S2: wrong OTP guesses are counted atomically (parallel guesses can't beat the 5-attempt limit) and resending no longer resets the count.
- S5: the login redirect uses `safeNextPath`, so `/login?next=/\evil.com` stays on the site.
- S9: hidden ticket types need their code at checkout; event links with `?code=` show them.
- S19/S20: cron routes always need `CRON_SECRET` (constant-time check); only the buyer can confirm their own demo payment.
- R1: a webhook stored but never processed is taken over by the gateway's next retry instead of being dropped as a duplicate.
- R2: reconciliation also checks orders that expired or failed in the last 48 hours, so a charge after a lost webhook still issues tickets.
- R3: refunds are claimed under a row lock (one gateway call per order), and promotion stop/reject can't refund twice.
- R4: a refund reverses exactly the ledger rows the order booked, so a failed sold-out refund retried by an admin no longer lowers the organiser's net.
- R5: money that arrives for a cancelled event is refunded automatically and issues no tickets.
- R6: order paid, failed, expired and refund decisions are audit-logged. R16: repeated ticket types in one checkout are merged.

## Demo milestone 4: dashboards, Telegram bot and demo polish

- F2 organiser onboarding at `/organiser`: apply as a business (TIN, trade licence photo) or individual (free events only) with a Telebirr or bank payout; admins approve or reject with a reason, and the applicant is notified. Team members are added by phone as manager or scanner.
- F3 event wizard: details (Amharic and/or English title, category, existing or new venue with a map pin, dates, uploaded or generated poster), ticket types (price, capacity, sales window, per-order limit, hidden with a code, reorder; sold types lock their price and can't be removed or shrunk below sales), then review and publish. A new organiser's first 3 events wait for admin review.
- F11 event dashboard: gross, net, fees kept apart, refunds, tickets per type, check-ins and attendees, with a CSV export. Phones appear only for buyers who ticked "share my phone" at checkout (logged as consent). Cancelling an event refunds every order in full through the gateway.
- F12 admin panel at `/admin`: organiser and event review queues, stuck refunds with retry, fraud flags (over 20 tickets per phone per event, failed-payment bursts, duplicate-scan spikes), featured events and per-event fee overrides at `/admin/events`, and a read-only audit log at `/admin/audit`.
- Seed adds an organiser application and an event waiting for review so the admin queues are never empty in the demo.
- F7 Telegram bot (`apps/bot`, grammY): `/start` links the chat by sharing your own phone number (only the sender's own contact counts), `/tonight` and `/weekend` event cards with poster, Addis date, venue, all-in "from" price and a Buy button that opens checkout as a Telegram Web App through a one-time 15-minute sign-in link (`/tg/login`), `/mytickets`, `/language` (saved on the account) and `/help`, all in Amharic by default or English. Paid tickets arrive in the chat as QR images (the wallet's static fallback code) with the event details, and ticket holders get reminders 24 hours and 3 hours before, once per person per event. Delivery runs through an idempotent outbox with retries, sent right after payment and from `/api/cron/telegram`. Settings has a "Connect Telegram" row. Without a bot token nothing changes.

## Launch hardening 2: moderation and content screening (F22)

- New `packages/moderation`: text screening with English, Amharic and Afaan Oromo lists (threats, scams, spam links, child-safety terms), resistant to case, zero-width characters, look-alike digits, stretched letters and interchangeable Ethiopic letters. The built-in lists are a starter set; the vetted slur and hate lists are loaded from `MODERATION_TERMS_FILE`, maintained by trust and safety.
- Images and video go through a pluggable classifier interface. With no classifier configured, uploads outside demo mode wait for a moderator instead of going public.
- Posts, comments, profiles, marketplace chat and booking requests are screened. Flagged posts and comments wait hidden in the moderator queue; child sexual content is removed at once. Threats, hate and scams aren't delivered in chat.
- Report button on posts, comments, profiles, chat messages and reviews, with new "threat" and "child sexual content" reasons and optional details. One report per person per item; a child-safety report hides the item straight away.
- Moderator queue at `/admin/moderation`, sorted by severity, then report count, then age, with 1-hour (urgent) and 24-hour due times. Actions: remove, 18+ only, warn, suspend, ban, dismiss. Each is recorded, audit-logged, closes the reports and notifies the person as ድንኳን (moderators stay anonymous).
- Strikes: 3 in 90 days suspend for 7 days; severe violations (and any child-safety removal) ban at once and end every session. Suspended accounts can't post, comment, message or follow; banned accounts can't sign in and their content disappears.
- Appeals at `/appeals/[id]`: once per decision, decided at `/admin/moderation/appeals` by a different moderator. Reversing restores the content, revokes the strike and lifts the suspension or ban.
- Copyright reports: removal notifies the uploader as a takedown.
- Community guidelines page (`/guidelines`, am/en), accepted at sign-up and logged as a consent.
- Media is only served for public content: files on screened, restricted or removed posts go only to the uploader and moderators, trade licences only to their owner and admins, and cache lifetimes dropped from one year to five minutes.
- Seed adds a second moderator (0911000008) for appeals and a couple of demo queue items.

Still open from F22: age checks for nightlife content and gifting and teen accounts (AC8), and a real image/video classifier and vetted keyword lists, which need a provider and trust-and-safety input.

## Launch hardening 3: privacy and data (PDPP 1321/2024)

- Privacy Policy (`/privacy`) and Terms of Use (`/terms`) in Amharic and English. Sign-up now asks people to accept the terms, the privacy policy and the community guidelines; each is logged as a consent (`terms:v1`, `privacy:v1`, `guidelines:v1`). Both texts are drafts for legal review.
- Settings → Your data: "Download my data" gives a JSON file of everything held about the member (account, consents, profile, posts, comments, likes, follows, orders, tickets, organiser and vendor records, chats they sent, reviews, promotions, reports, moderation decisions and appeals, notifications, uploads), with no secrets.
- "Delete my account" (type DELETE to confirm): profile, posts, comments, likes, follows, uploads, vendor profile, reviews, shortlists, reports and notifications are deleted, sent chat messages are blanked, and other people's counters are corrected. Orders, tickets and ledger rows stay for the financial record, with the name and phone removed; the phone number can sign up again as a new account. Deletion waits while the member has upcoming tickets, an open order, a live event or a running promotion. Audit-logged.
- Deleting a post now deletes its photos and videos too.

## Launch hardening 4: age rules (F22-AC8)

- Sign-up asks for a date of birth (stored as a date, PRD data model updated). Under 13 can't join: nothing is stored and the session ends. The date is set once; changing it goes through support.
- Teen accounts (13 to 17) start private.
- Nightlife events show an 18+ label on cards and the event page. Checkout for them needs an adult: teens are refused (`AGE_RESTRICTED`) and members who joined before birth dates were asked add one first (`BIRTH_DATE_REQUIRED`), from checkout or Settings.
- Age-restricted posts are for signed-in adults only. Posts tagged to nightlife events, and nightlife event promotions, are hidden from teens. The visibility helper resolves the viewer's age in one place; the feed bench now includes a teen viewer.
- New pro (vendor) profiles need an adult, so teens don't get messages from clients they don't know.

Not built yet: gifting (F18) is Phase 2 and will use the same adult check. Age is self-declared; there is no ID check beyond the gate.

## Launch hardening 5: operations

- Security headers on every web response: a same-origin Content-Security-Policy with no framing, HSTS, `nosniff`, `X-Frame-Options`, a strict referrer policy and a Permissions-Policy; `X-Powered-By` removed. The scanner gets its own set (camera allowed) in `apps/scanner/vercel.json`.
- Rate limits per IP and per member (`rate_limits` table, one atomic upsert per request): login codes, code checks, checkout, uploads, data export, people search and promotion clicks and impressions. Over the limit returns `429 RATE_LIMITED` with `Retry-After`.
- Structured JSON logs without query strings, bodies or phone numbers, and optional error reports to Sentry (`SENTRY_DSN`) from API errors, page render errors (`instrumentation.ts`) and Telegram jobs.
- `GET /api/health` for uptime monitors.
- Nightly encrypted database backup workflow (AES-256, verified by decrypting, kept 14 days), with a restore drill and runbook in `docs/OPERATIONS.md`.

## Launch hardening 6: remaining audit fixes

- Uploads: the first bytes must match the declared type (a renamed file is refused), and each member can upload up to 100 files or 300 MB a day (`UPLOAD_QUOTA`).
- Profile, cover and vendor pictures must be the member's own finished image upload, never an outside URL.
- Vendor profiles, event titles, descriptions and lineups pass the text screen before saving. Contact details in vendor text and booking requests are masked, and a vendor's social links show only after a deposit unlocks contact.
- Shared phones: logging out clears the offline wallet, drafts and cached pages; the app only caches ticket pages for offline use.
- Ticket QR codes are rotating only, signed from now until the event ends; an out-of-date wallet asks the buyer to reopen the ticket online.
- Cancelling a big event refunds in batches of 50 and the reconcile job finishes the rest. Promotions stuck in "waiting for payment" are checked with the gateway and marked paid or cancelled.
- Shares count once per member (and at most 50 a day), views once per member per day with a per-IP limit for visitors, and promotion clicks only from browsers with a visitor id, once a day, while the campaign is running. Every page load now gives a browser that id.
- Scanner logins get their own 18-hour session that only works for scanner endpoints.

Still open, needing infrastructure or a decision: admin two-factor login (S15), moving counters to background jobs (R9), a Redis job queue (L10) and a search service (L11).
