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

## Demo milestone 4: dashboards, Telegram bot and demo polish

- F2 organiser onboarding at `/organiser`: apply as a business (TIN, trade licence photo) or individual (free events only) with a Telebirr or bank payout; admins approve or reject with a reason, and the applicant is notified. Team members are added by phone as manager or scanner.
- F3 event wizard: details (Amharic and/or English title, category, existing or new venue with a map pin, dates, uploaded or generated poster), ticket types (price, capacity, sales window, per-order limit, hidden with a code, reorder; sold types lock their price and can't be removed or shrunk below sales), then review and publish. A new organiser's first 3 events wait for admin review.
- F11 event dashboard: gross, net, fees kept apart, refunds, tickets per type, check-ins and attendees, with a CSV export. Phones appear only for buyers who ticked "share my phone" at checkout (logged as consent). Cancelling an event refunds every order in full through the gateway.
- F12 admin panel at `/admin`: organiser and event review queues, stuck refunds with retry, fraud flags (over 20 tickets per phone per event, failed-payment bursts, duplicate-scan spikes), featured events and per-event fee overrides at `/admin/events`, and a read-only audit log at `/admin/audit`.
- Seed adds an organiser application and an event waiting for review so the admin queues are never empty in the demo.
- F7 Telegram bot (`apps/bot`, grammY): `/start` links the chat by sharing your own phone number (only the sender's own contact counts), `/tonight` and `/weekend` event cards with poster, Addis date, venue, all-in "from" price and a Buy button that opens checkout as a Telegram Web App through a one-time 15-minute sign-in link (`/tg/login`), `/mytickets`, `/language` (saved on the account) and `/help`, all in Amharic by default or English. Paid tickets arrive in the chat as QR images (the wallet's static fallback code) with the event details, and ticket holders get reminders 24 hours and 3 hours before, once per person per event. Delivery runs through an idempotent outbox with retries, sent right after payment and from `/api/cron/telegram`. Settings has a "Connect Telegram" row. Without a bot token nothing changes.
