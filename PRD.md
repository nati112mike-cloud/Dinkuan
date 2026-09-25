# PRD — ድንኳን (Dinkuan)

> Name: **ድንኳን** (Latin spelling "Dinkuan" for app stores, URLs and code; confirm before registering the domain)
> Owner: Founder · Version: 2.0 · Date: 2026-09-25 · Status: Ready to build
> v2 adds: social feed and reels, public profiles and follow, gifting, vendor marketplace, and promotion/boost packages.

---

## 0. How to use this document

- This is the **single source of truth** for what we build. Claude Code builds against it; anything not here is out of scope.
- Every feature has **user stories**, **acceptance criteria (AC)** and **edge cases**. A feature is "done" only when every AC passes with automated tests.
- Build order is defined in `BUILD_PROMPTS.md`. Coding rules live in `CLAUDE.md`.
- When something is unclear, **update this file first**, then build.

---

## 1. Product summary

**One line:** Addis's social home for everything that happens under the tent: find events, get in with one tap, share the moments, and hire the people who make them happen.

**Three pillars:**
1. **Events & tickets:** discovery, Telebirr-first checkout, Telegram delivery, offline QR check-in.
2. **Social:** posts, photos, memes, short videos and reels, comments, reactions, shares, follows and gifting. Every registered user has a public profile.
3. **Marketplace & promotion:** DJs, photographers, videographers, organisers and other vendors with pro profiles, portfolios, packages, ratings and booking. Anyone can buy promotion packages to boost an event, post, profile or work.

**Why people leave TikTok/Instagram for ድንኳን:**
- **Hyper-local:** the feed is Addis, not the whole world.
- **Creators earn in Birr:** gifts pay out to Telebirr. TikTok's creator monetisation is largely unavailable to Ethiopian creators, so this is the strongest hook.
- **Every event is a content moment:** posts and reels are tagged to events, venues and artists.
- **Low-data mode** built for Ethiopian mobile data costs.

**Release phases:** see section 7.

### Benchmarks we copy patterns from (features and flows, never branding or visual assets)

| Module | Benchmark | Pattern we adopt |
|---|---|---|
| Checkout | DICE, Posh | All-in price shown upfront, 3-tap checkout, buyer-paid fee |
| Tickets | DICE | Ticket bound to a phone number, rotating QR, in-app transfer |
| Discovery | Fever, Luma | "Tonight / This weekend" feed, curated picks, category chips |
| Promoter tools | Posh | Referral links with live sales per promoter |
| Organiser | Eventbrite Organizer | Live sales dashboard, multi-gate scanner, attendee list |
| Telegram | EthioTKT (local) | Ticket delivered in Telegram chat |
| Vendors | Fiverr, Thumbtack, GigSalad, The Knot | Pro profile, tiered packages (Basic/Standard/Premium), portfolio, verified reviews, request-a-quote, compare, levels/badges |
| Portfolio | Behance, Instagram grid | Visual grid of past work grouped by project/event |
| Social feed | Instagram, Facebook | Following + For You feed, carousels, comments with replies, reactions, share, save |
| Reels | TikTok, Instagram Reels, YouTube Shorts | Full-screen vertical swipe, autoplay, sounds, duets later |
| Gifting | TikTok LIVE gifts, YouTube Super Thanks | Tap-to-send gifts on posts/reels/lives; creator earns share |
| Promotion | Instagram/Facebook Boost, TikTok Promote, Eventbrite Ads | Pick goal → audience → budget → duration; live results |
| Invites (P2) | Partiful | Beautiful invite link + RSVP + guest list |

---

## 2. Users & roles

| Role | Who | Main job |
|---|---|---|
| **Guest** | Not logged in | Browse events |
| **Buyer** | Logged-in attendee | Buy, hold, transfer tickets |
| **Organiser** | Promoter, venue, event company | Create events, sell, get paid |
| **Promoter** | Person selling for an organiser | Share referral link, earn commission |
| **Scanner** | Gate staff (organiser invites them) | Validate tickets at the door |
| **Member** | Any registered user | Post, comment, react, follow, gift, watch reels |
| **Creator** | Member with creator mode on | Receive gifts, see analytics, get paid in Birr |
| **Vendor (Pro)** | DJ, photographer, videographer, organiser/planner, MC, decor, sound & light, makeup | Pro profile, portfolio, packages, get booked |
| **Advertiser** | Anyone buying a promotion | Boost events, posts, profiles, work |
| **Moderator** | Our team | Review reports and flagged content |
| **Admin** | Our team | Approve organisers/events, refunds, payouts, fraud |

One account can hold several roles (a member can also be an organiser, a creator and a vendor).

---

## 3. Non-functional requirements (apply to everything)

| Area | Requirement |
|---|---|
| **Language** | Full Amharic + English UI from day one. Every string in i18n files; no hard-coded text. Afaan Oromo slot prepared (P2). |
| **Calendar/time** | Store all times in UTC. Display in Africa/Addis_Ababa. Toggle to show Ethiopian calendar date alongside Gregorian. |
| **Currency** | Everything is priced and paid in **Birr (ETB)**; users only ever see Birr. Internally the code stores amounts as whole santim (100 santim = 1 Birr) so computers never make rounding errors (e.g. 150.50 Birr is stored as 15050). No coins or crypto are involved. USD card payments for the diaspora later. |
| **Video** | Upload up to 3 min. Transcode to HLS at 240p/360p/720p. Adaptive playback. **Low-data mode** plays 240p and disables autoplay. |
| **Content rules** | Community guidelines in am/en. Automated screening + report button + moderator queue. Complies with Ethiopia's Hate Speech and Disinformation Prevention Proclamation 1185/2020. |
| **Performance** | Event feed first load < 2.5s on 3G. Images WebP, max 150 KB for cards. |
| **Offline** | Tickets viewable offline once loaded. Scanner works with **zero internet** for a full event. |
| **Security** | OTP login, rate limits, signed QR codes, webhook signature checks, role-based access on every endpoint. |
| **Payments** | Platform **never holds funds**. Money moves only through licensed gateways (Chapa, Telebirr). Payment state changes **only** via verified webhooks or server-side verify calls, never via client redirects or screenshots. |
| **Data protection** | Ethiopia PDPP 1321/2024: primary DB hosted locally, consent logged, privacy policy in Amharic and English, user can export and delete data. |
| **Accessibility** | Min 44px tap targets, readable contrast, works on 5-inch Android phones. |
| **Observability** | Structured logs, error tracking, an audit log for money and admin actions. |

---

## 4. Features

Which phase each feature ships in is defined in section 7.

# PART A — EVENTS & TICKETS

### F1. Authentication & profile

**Stories**
- As a user, I sign up and log in with my Ethiopian phone number and a one-time code, so I don't need a password.
- As a user, I can link my Telegram account so tickets and reminders arrive there.
- As a user, I choose Amharic or English and it remembers.

**Acceptance criteria**
- AC1: Phone accepted in formats `09XXXXXXXX`, `07XXXXXXXX`, `+2519...`, `+2517...` and normalised to E.164.
- AC2: 6-digit OTP, valid 5 minutes, max 5 attempts, max 3 sends per 15 minutes per number.
- AC3: Session lasts 30 days on a device; logout clears it.
- AC4: Telegram linking via bot deep link (`/start <token>`); token single-use, expires in 10 minutes.
- AC5: Profile stores name, phone, language, optional email.

**Edge cases:** SMS delayed → offer "send via Telegram" if linked; number changed → admin-assisted recovery.

---

### F2. Organiser onboarding & verification

**Stories**
- As an organiser, I apply with my business name, TIN and trade licence photo, and payout details, so I can sell tickets.
- As an admin, I approve or reject organisers with a reason.

**Acceptance criteria**
- AC1: States: `draft → submitted → approved | rejected`. Only `approved` organisers can publish paid events.
- AC2: Individuals (no licence) can publish **free** events only.
- AC3: Payout destination = bank account or Telebirr number, verified by admin.
- AC4: New organisers get `payout_hold = true` for their first 3 events (paid only after the event ends).
- AC5: Organiser can invite team members as `manager` or `scanner`.

---

### F3. Event creation & management

**Stories**
- As an organiser, I create an event with a title, poster, description, venue, date/time, category and ticket types.
- As an organiser, I save a draft, preview it, then publish.

**Acceptance criteria**
- AC1: Required: title (am/en, at least one), poster, start time, venue name + map pin, category, at least one ticket type.
- AC2: Categories: Nightlife, Concert, Festival, Comedy, Arts & Culture, Conference, Sports, Community, Holiday.
- AC3: Ticket types: name, price (0 = free), capacity, sales start/end, per-order max (default 10), visibility (public/hidden with code).
- AC4: Tiers such as Early Bird / Regular / VIP / Table. Early bird can auto-close at a date or quantity.
- AC5: Event states: `draft → pending_review → published → ended | cancelled`. First 3 events of a new organiser require admin review.
- AC6: Editing price is blocked on a ticket type that already has sales; organiser must add a new type.
- AC7: Cancelling a published event with sales triggers **F9 refunds for all orders** and notifies buyers.
- AC8: Poster auto-resized to card (WebP) and share sizes (1080x1080, 1080x1920).

---

### F4. Discovery feed & event page

**Stories**
- As a guest, I see what's on tonight and this weekend without logging in.
- As a buyer, I filter by category, date and price and search by name, venue or artist.

**Acceptance criteria**
- AC1: Home sections: Featured (admin-curated), Tonight, This Weekend, Upcoming, by Category.
- AC2: Filters: date (today / weekend / this week / pick date), category, price (free / under 500 / 500–1500 / 1500+ ETB).
- AC3: Search matches title, venue, organiser and lineup, in Amharic and English.
- AC4: Event page shows poster, title, date (Gregorian + optional Ethiopian), time, venue + map link, lineup, description, ticket types with **all-in price** (fee included), organiser with verified badge, share button.
- AC5: Sold-out types show "Sold out"; ended events show "Ended".
- AC6: Share creates a link with Open Graph preview (poster + title) that looks good in Telegram, WhatsApp and Instagram DMs.
- AC7: Save/like an event; saved list in profile.

---

### F5. Checkout & payments

**Stories**
- As a buyer, I pick tickets, pay with Telebirr (or another method via Chapa) and get my ticket in seconds.

**Acceptance criteria**
- AC1: Flow: select quantity → review (all-in price + fee breakdown) → choose method → pay → success screen with tickets. Max 3 taps after selecting tickets.
- AC2: **Fee:** buyer pays `5% of ticket price + 10 ETB per paid ticket` (configurable per event by admin). Free tickets have no fee.
- AC3: Inventory is **reserved for 10 minutes** when checkout starts; released automatically if unpaid.
- AC4: Methods (MVP): Telebirr (direct H5 integration), plus Chapa hosted checkout (CBE Birr, M-Pesa, Awash Birr, cards).
- AC5: Order states: `pending → paid | failed | expired`, then `refunded | partially_refunded`.
- AC6: An order becomes `paid` **only** after a verified gateway webhook **or** a server-side verify call. Client redirect alone never marks it paid.
- AC7: Webhook handling is **idempotent** (the same event received twice creates no duplicate tickets).
- AC8: A reconciliation job every 10 minutes verifies all `pending` orders older than 5 minutes with the gateway.
- AC9: Rate limit: max 3 pending orders per user; per-event max tickets per phone number (default 10).
- AC10: Receipt with order number, items, fee and total sent by SMS/Telegram.

**Edge cases:** payment succeeds after reservation expired → if stock remains, issue tickets; if sold out, auto-refund and notify. User closes the app mid-payment → reconciliation fixes the state.

---

### F6. Tickets & wallet

**Stories**
- As a buyer, I see my tickets in the app and in Telegram, even offline.
- As a buyer, I transfer a ticket to a friend by phone number.

**Acceptance criteria**
- AC1: One ticket = one attendee = one unique ID.
- AC2: QR payload = `ticketId.eventId.version.signature`, signed with the **event's Ed25519 private key** (server-side only).
- AC3: In the app, the QR **rotates every 30 seconds** (the payload includes a time window, signed). Telegram/SMS get a static QR as fallback.
- AC4: Wallet shows Upcoming and Past tickets; cached for offline viewing.
- AC5: Transfer: enter the recipient's phone → recipient gets the ticket, the sender's copy is invalidated (version increments). Transfer allowed until 2 hours before start. Max 2 transfers per ticket.
- AC6: Ticket states: `valid → checked_in | transferred | refunded | void`.

---

### F7. Telegram bot

**Stories**
- As a user, I discover and buy events and receive tickets without installing an app.

**Acceptance criteria**
- AC1: Commands: `/start`, `/weekend`, `/tonight`, `/mytickets`, `/language`, `/help`.
- AC2: Event cards with poster, date, price and a "Buy" button that opens checkout (Telegram Web App or a signed link).
- AC3: After payment, the ticket QR image + event details are sent to the chat.
- AC4: Reminders 24 hours and 3 hours before the event.
- AC5: Bot replies in the user's language.

---

### F8. Scanner app (check-in)

**Stories**
- As gate staff, I scan tickets fast, even with no internet.

**Acceptance criteria**
- AC1: Scanner logs in, picks the event, and **downloads the offline pack**: event public key + ticket list (id, version, status, type).
- AC2: Verification happens **locally**: signature valid + time window valid (for rotating QR) + version matches + not already checked in.
- AC3: Result in under 1 second: large green VALID (with ticket type and name) / red INVALID with reason (already used + time, wrong event, fake, refunded).
- AC4: Check-ins queue locally and sync when online; multiple gates merge, first scan wins, conflicts flagged.
- AC5: Manual search by name or phone as fallback.
- AC6: Live counter: checked in / total.
- AC7: Works as an installable PWA on Android with camera access.

---

### F9. Refunds & cancellations

**Acceptance criteria**
- AC1: Organiser sets a policy per event: `no_refunds` (default) or `refund_until` (a date).
- AC2: Event cancelled → **full refund of ticket + fee**, automatically via the gateway refund API, buyers notified.
- AC3: Admin can refund any order fully or partially, with a reason (audit logged).
- AC4: Refunded tickets become `refunded` and are rejected by the scanner after the next sync.
- AC5: If the gateway refund API fails, the order is marked `refund_pending` and goes to a manual queue for admin.

---

### F10. Promoter referral links

**Acceptance criteria**
- AC1: Organiser creates promoter links (name + optional commission %).
- AC2: Link format `/e/{slug}?ref={code}`; attribution stored on the order (last click, 7-day cookie).
- AC3: Organiser dashboard shows sales per promoter; promoter sees their own sales on a view-only page.
- AC4: Promo codes: % or fixed discount, usage cap, expiry, limited to specific ticket types.

---

### F11. Organiser dashboard & payouts

**Acceptance criteria**
- AC1: Live stats per event: gross sales, tickets sold per type, fees, net payable, check-ins, sales by promoter.
- AC2: Attendee list export (CSV) with name, ticket type and check-in status. Phone numbers only if the buyer consented.
- AC3: **Payouts ledger:** net = ticket revenue − refunds. Platform fee is never mixed into organiser revenue.
- AC4: Payout requests: available `T+1` after the event ends (or immediately after each sale for trusted organisers, set by admin). Admin marks it paid with a reference.
- AC5: Every money movement is written to an append-only ledger table.

---

### F12. Admin panel

**Acceptance criteria**
- AC1: Queues: organiser applications, events pending review, refunds pending, payouts requested, fraud flags.
- AC2: Feature events on Home; set per-event fee overrides.
- AC3: Fraud flags: more than 20 tickets per phone per event, many failed payments, scanner duplicate spikes.
- AC4: Every admin action is audit logged (who, what, when, before/after).

---

### F13. Notifications

| Trigger | Channels |
|---|---|
| OTP | SMS (Telegram if linked) |
| Order paid (tickets) | Telegram + SMS link |
| Event reminder 24h / 3h | Telegram / push |
| Event changed / cancelled | Telegram + SMS |
| Ticket received by transfer | Telegram + SMS |
| Organiser: application result, payout paid | Telegram + email |
| New follower, comment, reaction, mention, gift received | In-app + push (batched, max 1 per 15 min per type) |
| Booking request, offer, deposit paid, booking reminder | In-app + Telegram + push |
| Promotion approved, started, ended (with results) | In-app + Telegram |

---

# PART B — SOCIAL

### F14. Public profiles & follow

**Stories**
- As a member, I have a public profile so people can find me and see what I post.
- As a member, I follow people, organisers, venues and vendors to see their posts in my feed.

**Acceptance criteria**
- AC1: Profile: unique `@username` (Latin letters, numbers, `_`, `.`), display name (Amharic allowed), photo, cover, bio (150 chars), link, location (sub-city optional).
- AC2: Tabs: Posts · Reels · Events (going/attended, if public) · Tagged. Vendor and organiser profiles get extra tabs (see F20).
- AC3: Counters: followers, following, likes received.
- AC4: Follow / unfollow; private account option (follow requests must be approved).
- AC5: Block (both sides can no longer see or contact each other) and mute (hide their content silently).
- AC6: Badges: Verified (ID-checked), Creator, Pro vendor type, Organiser.
- AC7: Profile share link with Open Graph preview.

---

### F15. Posts (photos, videos, text, memes)

**Stories**
- As a member, I post photos, videos, text and memes, and tag an event, venue or people.

**Acceptance criteria**
- AC1: Post types: text (up to 2,000 chars), photos (1–10 carousel), video (up to 3 min), meme (image with top/bottom text editor built in).
- AC2: Optional tags: event, venue/location, people (@mentions), hashtags (#).
- AC3: Audience: Public / Followers only.
- AC4: Edit caption within 24 h; delete anytime.
- AC5: Posts tagged to an event appear on that event's page under "Moments", which is the memories feature.
- AC6: Upload works on weak networks: resumable uploads, compression on the device before upload, progress shown, retries automatically.
- AC7: Every upload passes automated screening (F22) before it becomes public; borderline content goes to the moderator queue.
- AC8: Drafts are saved on the device.

---

### F16. Feed, reels & engagement

**Stories**
- As a member, I scroll a feed of people I follow and a For You feed of popular Addis content.
- As a member, I swipe through full-screen reels like TikTok.
- As a member, I like, react, comment, reply, share and save.

**Acceptance criteria**
- AC1: Home tabs: **For You** · **Following** · **Events**. Reels open in a separate full-screen vertical player (swipe up/down).
- AC2: Reactions: like (double-tap), plus a reaction set: ❤️ 😂 🔥 😮 😢 👏.
- AC3: Comments with one level of replies, likes on comments, pin a comment (post owner), delete/hide comments on own posts, filter keywords.
- AC4: Share: repost to own profile (with optional comment), send in in-app DM (P2), copy link, share to Telegram/WhatsApp.
- AC5: Save posts to private collections.
- AC6: **For You ranking v1** (simple, explainable): score = engagement rate (reactions, comments, shares, full watches) × recency decay × locality boost (Addis) × relationship boost (follows, same events attended). Tuned later with data.
- AC7: Reels: autoplay muted on first open with a tap to unmute, loop, progress bar, preload the next 2 videos, show view count.
- AC8: Low-data mode: 240p, no autoplay, no preloading.
- AC9: Watch time and completions are tracked for ranking and creator analytics.
- AC10: Sponsored posts (F21) appear in the feed with a clear "Sponsored · ማስታወቂያ" label, at most 1 per 6 organic posts.

---

### F17. Find & add people (growth)

**Stories**
- As a new member, I quickly find friends and interesting people so the app feels alive from minute one.

**Acceptance criteria**
- AC1: Onboarding: pick interests (music genres, nightlife, weddings, art, comedy, sports, food) → suggested creators/vendors/organisers to follow (minimum 10 suggestions).
- AC2: Contact sync (opt-in with explicit consent): phone numbers hashed on the device and matched server-side; raw contacts are never stored.
- AC3: Suggestions: people who attended the same events, mutual follows, popular in Addis, similar interests.
- AC4: Search people by name or @username, in Amharic and English.
- AC5: Invite friends via Telegram/SMS with a referral code (both get a reward, e.g. a free-fee ticket).
- AC6: QR profile code, so people at an event can scan each other and follow.

---

### F18. Gifting & creator earnings

**Stories**
- As a member, I send a gift to a creator's post, reel or live to support them.
- As a creator, I earn Birr from gifts and withdraw it to Telebirr.

**Acceptance criteria**
- AC1: Gift catalogue with Ethiopian-themed gifts at fixed Birr prices, e.g. ☕ Buna 10 Br · 🌹 Rose 25 Br · 🍯 Tej 50 Br · 🥁 Kebero 100 Br · 🎪 Dinkuan 1,000 Br. Admin can edit it.
- AC2: **MVP payment model: pay per gift in Birr** (Telebirr USSD/in-app confirm via the gateway). There is **no prepaid coin balance** at MVP (see compliance note).
- AC3: Split: creator receives **70%**, platform 30% (configurable). The share is written to the ledger per gift.
- AC4: Gifts show as an animation on the post/reel and in a "Top supporters" list.
- AC5: Creator mode requires phone + ID verification and payout details.
- AC6: Creators can withdraw once earnings are at least 500 Br, to Telebirr/bank; paid within 3 working days.
- AC7: Anti-fraud: gift velocity limits, refund window 24 h only if unauthorised, and self-gifting is blocked.
- AC8: Creator analytics: views, watch time, followers gained, gifts earned per post.

> **Compliance note:** a prepaid "coins" wallet is a stored-value payment instrument that likely needs an NBE licence. Start with pay-per-gift. Add a gift bundle wallet later **only** through a licensed partner (e.g. Telebirr mini-app or a licensed gateway) and after a legal opinion.

---

### F19. Live streaming (Phase 2 in the social pillar)

- Creators, DJs and organisers go live from their phone; viewers comment and gift in real time.
- Ticketed live (PPV) for events, e.g. diaspora wedding and concert viewing.
- Built on a managed live-video service; music-rights warranty required for DJ sets (see strategy report).

---

# PART C — MARKETPLACE

### F20. Vendor pro profiles & marketplace

**Stories**
- As a client, I compare DJs, photographers and organisers by their past work, stages, reviews and prices, so I can hire the right one with confidence.
- As a vendor, I have a pro profile that sells me, like a portfolio website.

**Vendor types:** DJ · Photographer · Videographer · Event organiser/planner · MC · Decor · Sound & lighting · Makeup & beauty · Band/musician (more can be added by admin).

**Pro profile acceptance criteria**
- AC1: Everything in F14, plus: headline ("Afro-house & wedding DJ · 8 years"), years of experience, service types, genres/styles, languages, areas served, equipment list, team size, social links, response time (auto-calculated).
- AC2: **Portfolio:** albums of photos/videos grouped by project ("Hilton wedding, Jan 2026"). Each item can be tagged to a ድንኳን event. If the organiser confirms the tag, the work shows as **"Verified gig"** (proof they really worked there).
- AC3: **Stages & clients:** list of venues and events played/worked, verified ones marked.
- AC4: **Packages** (Fiverr style): up to 3 tiers (Basic / Standard / Premium) with price, hours, what's included and add-ons (extra hour, drone, album print…). "Starting from" price shown on cards.
- AC5: **Availability calendar:** vendor blocks dates; booked dates block automatically.
- AC6: **Reviews:** only clients with a completed booking can review. 1–5 stars + text + photos; sub-ratings for punctuality, quality, value and communication. Vendor may reply once publicly.
- AC7: **Levels:** New → Rising → Top Rated → ድንኳን Pro, earned by completed bookings, rating ≥ 4.7, response rate and zero cancellations.
- AC8: Pro profile posts also appear in the social feed, so vendors grow followers by posting their work.

**Search & compare acceptance criteria**
- AC9: Browse by type, then filter by date available, price range, rating, genre/style, area, level, languages.
- AC10: Sort: recommended (quality score + promoted), top rated, price low–high, most booked.
- AC11: Result cards: cover photo/video preview, name, level, rating (count), starting price, top genres, "Available on your date" badge.
- AC12: **Compare** up to 3 vendors side by side: price, packages, rating, experience, verified gigs, response time.
- AC13: Save vendors to a shortlist; share a shortlist with family on Telegram, since families decide weddings together.

**Booking flow acceptance criteria (Phase 2 for payment; Phase 1 for requests)**
- AC14: Client sends a **request**: event date, time, venue, type, guests, budget, notes.
- AC15: In-app chat between client and vendor. **Phone numbers and external links are hidden and auto-masked until a deposit is paid** (stops people taking the deal outside).
- AC16: Vendor sends an **offer** (package + price + deposit %, default 30%). Client accepts → pays the deposit via the gateway → booking `confirmed`, date blocked.
- AC17: Platform commission 10% (5% on repeat bookings with the same client), taken from the deposit.
- AC18: Balance paid in-app or offline (vendor marks as received).
- AC19: After the event, the client confirms completion (auto-confirm after 72 h). Then reviews unlock.
- AC20: Cancellation rules: client cancels > 14 days before → deposit refunded minus fee; < 14 days → vendor keeps the deposit. Vendor cancels → full refund + strike + the platform suggests 3 available alternatives.
- AC21: Disputes: either side opens one within 72 h; admin decides using chat history and evidence.
- AC22: Booking states: `requested → offered → confirmed → completed → reviewed`, or `cancelled | disputed`.

---

# PART D — PROMOTION (ads)

### F21. Promotion packages & boost

**Stories**
- As an organiser, vendor, creator, artist or painter, I pay to promote my event, post, profile or work to more people in Addis.
- As an advertiser, I see how many people saw it, clicked and bought.

**What can be promoted:** an event · a post or reel · a vendor/creator profile · a marketplace package.

**Acceptance criteria**
- AC1: **Boost flow (Instagram/TikTok style), 4 steps:** choose goal (views · profile visits · followers · ticket sales · booking requests) → audience (Automatic, or custom: age range, gender, interests, sub-cities) → budget & duration (e.g. 200 Br/day for 3 days) → review & pay.
- AC2: Show an **estimated reach** before payment, e.g. "2,000–5,500 people", from the pricing model.
- AC3: **Ready-made packages** for non-technical buyers:

| Package | What you get | Example price (configurable) |
|---|---|---|
| Starter Boost | ~3,000 feed/reel impressions, 3 days | 300 Br |
| Event Spotlight | Featured slot on Events tab + boosted post, 7 days | 1,500 Br |
| Weekend Takeover | Top of Home "This weekend" + reels boost + Telegram channel post | 5,000 Br |
| Vendor Top Search | Top 3 in marketplace search for your type, 30 days | 1,000 Br |
| Push Blast | Push notification to matching audience (limited slots per day) | 3,000 Br |

- AC4: Pricing engine: cost per 1,000 impressions (CPM) set by admin per placement, with a minimum per day. Budget is spent evenly across the duration.
- AC5: All promoted content passes **ad review** (moderation rules + no misleading claims) before going live.
- AC6: Label "Sponsored · ማስታወቂያ" on every promoted item.
- AC7: **Results dashboard:** impressions, reach, clicks, follows, and conversions (tickets sold, booking requests) attributed to the promotion.
- AC8: Unspent budget (e.g. content rejected or a campaign stopped early) is refunded through the gateway.
- AC9: Frequency cap: the same promotion is shown to the same user at most 3 times per day.

---

# PART E — SAFETY

### F22. Moderation & trust

**Acceptance criteria**
- AC1: Community guidelines (am/en) accepted at sign-up.
- AC2: Automated screening on all images/videos (nudity, graphic violence) and text (hate speech, slurs in Amharic, Afaan Oromo and English keyword lists, spam links) before content is public.
- AC3: Report button on every post, comment, profile, message and review, with reasons.
- AC4: Moderator queue sorted by severity and report count; actions: remove, age-restrict, warn, suspend, ban. Every action is audit logged.
- AC5: Strikes: 3 strikes in 90 days → 7-day suspension; severe violations → immediate ban.
- AC6: Appeals: the user can appeal once; a different moderator reviews it.
- AC7: Target: urgent reports (threats, hate speech, sexual content involving minors) actioned within 1 hour, all others within 24 hours. Illegal child sexual content is removed immediately and reported per law.
- AC8: Minimum age 18 for nightlife content and gifting; 13+ for general use, with teen accounts private by default and no DMs from unknown adults.
- AC9: Rate limits on posting, commenting and following to stop spam bots.
- AC10: Copyright takedown: rights holders can report; content removed and the uploader notified.

---

## 5. Data model (MVP)

All IDs are UUIDs. All money is integer santim. All times are UTC `timestamptz`.

```
User(id, phone UNIQUE, name, email?, lang[am|en], telegram_chat_id?, created_at)
Role(user_id, role[buyer|organiser|admin])

Organiser(id, owner_user_id, name, tin?, licence_url?, type[business|individual],
          status[draft|submitted|approved|rejected], payout_method, payout_account,
          payout_hold BOOL, trusted BOOL, created_at)
OrganiserMember(organiser_id, user_id, role[manager|scanner])

Venue(id, name, address, lat, lng)
Event(id, organiser_id, slug UNIQUE, title_am?, title_en?, desc_am?, desc_en?,
      category, poster_url, venue_id, starts_at, ends_at, lineup TEXT[],
      status[draft|pending_review|published|ended|cancelled], refund_policy,
      refund_until?, fee_pct_bps, fee_fixed_santim, featured BOOL,
      signing_public_key, created_at)
EventSigningKey(event_id, private_key_encrypted)   -- server-only, KMS/secret-encrypted

TicketType(id, event_id, name, price_santim, capacity, sold, reserved,
           per_order_max, sales_start, sales_end, visibility, access_code?)

Order(id, user_id, event_id, status[pending|paid|failed|expired|refunded|partially_refunded|refund_pending],
      subtotal_santim, fee_santim, total_santim, gateway[telebirr|chapa],
      gateway_ref UNIQUE, promo_code_id?, promoter_link_id?, expires_at, paid_at?, created_at)
OrderItem(id, order_id, ticket_type_id, qty, unit_price_santim)

Ticket(id, order_id, ticket_type_id, event_id, holder_user_id, holder_name,
       version INT, status[valid|checked_in|transferred|refunded|void],
       transfer_count INT, checked_in_at?, checked_in_by?, gate?)
TicketTransfer(id, ticket_id, from_user_id, to_user_id, created_at)

PromoterLink(id, event_id, name, code UNIQUE, commission_bps)
PromoCode(id, event_id, code, type[pct|fixed], value, max_uses, used, expires_at, ticket_type_ids[])

PaymentEvent(id, gateway, gateway_ref, type, raw_payload JSONB, signature_ok BOOL,
             processed BOOL, received_at)        -- webhook inbox (idempotency)
Refund(id, order_id, amount_santim, reason, status[pending|done|failed], gateway_ref?, created_by)
LedgerEntry(id, organiser_id?, order_id?, type[sale|fee|refund|payout], amount_santim,
            balance_after_santim, ref, created_at)   -- append-only
Payout(id, organiser_id, amount_santim, status[requested|paid|rejected], reference?, paid_at?)

CheckIn(id, ticket_id, scanner_user_id, gate, scanned_at, synced_at, result)
Consent(id, user_id, type, granted BOOL, created_at)
AuditLog(id, actor_user_id, action, entity, entity_id, before JSONB, after JSONB, created_at)
OtpCode(phone, code_hash, expires_at, attempts)

-- SOCIAL
Profile(user_id PK, username UNIQUE, display_name, bio, avatar_url, cover_url, link,
        sub_city?, is_private BOOL, is_verified BOOL, creator_mode BOOL, low_data_mode BOOL)
Follow(follower_id, followee_id, status[active|requested], created_at)  PK(follower_id, followee_id)
Block(blocker_id, blocked_id)   Mute(muter_id, muted_id)
Post(id, author_id, type[text|photo|video|meme|reel], caption, audience[public|followers],
     event_id?, venue_id?, status[processing|screening|public|removed|restricted],
     view_count, reaction_count, comment_count, share_count, created_at, edited_at?)
Media(id, post_id, kind[image|video], storage_key, hls_url?, width, height, duration_s?,
      thumb_url, blurhash, order_idx)
Hashtag(id, tag UNIQUE)   PostHashtag(post_id, hashtag_id)   Mention(post_id, user_id)
Reaction(user_id, post_id, type[like|love|haha|fire|wow|sad|clap])  PK(user_id, post_id)
Comment(id, post_id, author_id, parent_id?, body, like_count, pinned BOOL, status, created_at)
CommentLike(user_id, comment_id)
Share(id, post_id, user_id, type[repost|external|dm], comment?, created_at)
SavedPost(user_id, post_id, collection?)
WatchEvent(user_id, post_id, watched_ms, completed BOOL, created_at)   -- for ranking (aggregate daily)
Interest(id, key)   UserInterest(user_id, interest_id)
ContactHash(user_id, hash)   -- hashed phone numbers only, opt-in

-- GIFTING
Gift(id, key, name_am, name_en, price_santim, animation_url, active BOOL)
GiftSend(id, gift_id, sender_id, recipient_id, post_id?, live_id?, order_id,
         creator_share_santim, platform_share_santim, status[pending|paid|refunded], created_at)
CreatorPayout(id, user_id, amount_santim, status[requested|paid|rejected], reference?, paid_at?)

-- MARKETPLACE
VendorProfile(user_id PK, types[], headline, years_experience, genres[], languages[],
              areas[], equipment TEXT, team_size, level[new|rising|top_rated|pro],
              rating_avg, rating_count, response_rate, response_time_min, verified_id BOOL)
PortfolioAlbum(id, vendor_id, title, event_id?, verified_gig BOOL, cover_url, created_at)
PortfolioItem(id, album_id, media_id, caption, order_idx)
StageCredit(id, vendor_id, venue_or_event_name, event_id?, date?, verified BOOL)
Package(id, vendor_id, tier[basic|standard|premium], name, price_santim, hours,
        includes TEXT[], active BOOL)
PackageAddon(id, package_id, name, price_santim)
AvailabilityBlock(id, vendor_id, date, reason[blocked|booked], booking_id?)
BookingRequest(id, client_id, vendor_id, event_date, start_time, venue, event_type,
               guests, budget_santim?, notes, status, created_at)
Conversation(id, booking_request_id, client_id, vendor_id, contact_unlocked BOOL)
Message(id, conversation_id, sender_id, body, attachments[], masked BOOL, created_at)
Offer(id, booking_request_id, package_id?, price_santim, deposit_bps, addons JSONB,
      expires_at, status[sent|accepted|declined|expired])
Booking(id, offer_id, client_id, vendor_id, event_date, total_santim, deposit_santim,
        commission_santim, deposit_order_id, balance_status[unpaid|paid_in_app|paid_offline],
        status[confirmed|completed|reviewed|cancelled|disputed], completed_at?)
Review(id, booking_id UNIQUE, client_id, vendor_id, stars, punctuality, quality, value,
       communication, body, photos[], vendor_reply?, created_at)
Shortlist(id, user_id, name, share_token)   ShortlistItem(shortlist_id, vendor_id)
Dispute(id, booking_id, opened_by, reason, status, resolution?, created_at)

-- PROMOTION
Campaign(id, advertiser_id, target_type[event|post|profile|package], target_id,
         goal[views|profile_visits|followers|ticket_sales|booking_requests],
         package_key?, audience JSONB, budget_santim, daily_budget_santim,
         starts_at, ends_at, status[draft|pending_review|active|paused|ended|rejected],
         order_id, spent_santim, refunded_santim)
AdPlacement(key[feed|reels|events_featured|home_weekend|search_top|push], cpm_santim, min_daily_santim)
AdImpression(campaign_id, user_id, placement, created_at)   -- aggregate hourly
AdConversion(campaign_id, type, ref_id, created_at)

-- SAFETY
Report(id, reporter_id, target_type, target_id, reason, details, status, created_at)
ModerationAction(id, moderator_id, target_type, target_id, action, reason, created_at)
Strike(id, user_id, reason, expires_at)
Appeal(id, action_id, user_id, body, status, reviewed_by?)
```

**Key constraints**
- `TicketType.sold + reserved <= capacity`, enforced with a DB transaction and row lock.
- `Order.gateway_ref` UNIQUE; `PaymentEvent(gateway, gateway_ref, type)` UNIQUE → idempotency.
- `LedgerEntry` has no UPDATE or DELETE permission for the app role.

---

## 6. Screens (MVP)

**Buyer (PWA):** Home feed · Search/filters · Event page · Checkout · Payment pending/success · My tickets (wallet) · Ticket detail (rotating QR) · Transfer ticket · Saved events · Profile/language · Login (phone → OTP)

**Organiser (web, mobile-friendly):** Apply/verification · Dashboard · Create/edit event (steps: details → tickets → review) · Event stats · Attendees · Promoter links & promo codes · Team (scanners) · Payouts

**Scanner (PWA):** Login · Select event · Download offline pack · Scan screen · Manual search · Stats

**Admin (web):** Queues · Organisers · Events · Orders/refunds · Payouts · Fraud flags · Audit log

**Telegram bot:** Commands and cards per F7.

**Social (app):** Home (For You / Following / Events) · Reels player · Create post (camera, gallery, meme editor, tag event) · Post detail + comments · Profile (own/other) · Followers/following · Find people & onboarding interests · Notifications · Saved · Settings (privacy, blocked, low-data mode)

**Creator:** Creator mode setup · Analytics · Gifts earned · Withdraw

**Marketplace:** Hire tab (vendor types) · Search results + filters · Vendor pro profile (About · Portfolio · Packages · Reviews · Stages · Posts) · Compare · Shortlist · Request form · Chat · Offer · Bookings (client & vendor views) · Vendor dashboard (requests, calendar, packages, earnings) · Review form

**Promotion:** "Promote" button on events/posts/profiles/packages · Boost wizard (goal → audience → budget → review) · Packages page · Campaign results

**Moderation (web):** Report queue · Content review · User history & strikes · Appeals · Ad review queue

**Main navigation (bottom bar):** 🏠 Home · 🎬 Reels · ➕ Create · 🎟 Events · 🎧 Hire — profile and notifications at the top.

---

## 7. Release phases

The app must feel alive on launch day, so **social + events ship together**; money-heavy features follow once payments are proven.

| Phase | Timeline (target) | Ships |
|---|---|---|
| **Phase 1 — Launch** | ~12–14 weeks | F1–F13 events & tickets · F14 profiles & follow · F15 posts · F16 feed + reels (basic ranking) · F17 find people · F22 moderation · F20 vendor pro profiles, portfolios, packages, search, compare and **booking requests + chat** (no deposit yet) · F21 **ready-made promotion packages** (admin-sold, fixed slots) |
| **Phase 2 — Money** | +8–10 weeks | F18 gifting & creator payouts · F20 deposits, commissions, reviews, disputes, levels · F21 self-serve boost wizard with CPM engine & results · F19 live streaming · DMs · invitation maker + RSVP · tables & group pay |
| **Phase 3 — Depth** | +3–6 months | Ticketed livestream PPV for the diaspora · wedding planning toolkit · gift registry · resale marketplace · smarter For You ranking (ML) · Afaan Oromo · native apps if needed |

### Out of scope until listed in a phase
Stored-value coin wallet, crypto, equb/group saving, venue booking marketplace.

---

## 8. Launch content plan (so the feed isn't empty)

- Before launch, onboard **50 creators, 100 vendors and 20 promoters** with complete profiles and at least 10 posts each.
- Weekly **#ድንኳን challenges** with prize money in Birr (e.g. best event reel of the week).
- Our own photographers at every ticketed event, posting reels tagged to the event.
- Creator starter fund: guaranteed minimum gift earnings for the first 3 months for the top 20 creators.

---

## 9. Success metrics (first 90 days)

| Metric | Target |
|---|---|
| Paid tickets sold | 5,000–10,000 |
| Checkout success rate (started → paid) | > 70% |
| Payment failures caused by us | < 2% |
| Fake tickets admitted | 0 |
| Organisers who run a 2nd event | > 60% |
| Median scan time | < 1 s |
| Buyers via Telegram bot | > 30% |
| Registered members | 50,000 |
| Daily active / monthly active | > 25% |
| Average time in app per day (active users) | > 15 min |
| Posts per day | > 1,000 |
| Vendors with complete pro profiles | > 300 |
| Booking requests per week | > 150 |
| Promotion revenue per month | > 150,000 Br |
| Urgent reports handled < 1 h | > 95% |

---

## 10. Open questions (resolve before or during build)

1. Latin spelling of ድንኳን (Dinkuan / Dinkwan / Dinkan) for domain, store listing and @handles; secure them now.
2. Chapa and Telebirr merchant fees and settlement terms (get written quotes).
3. Legal opinion: payout timing and whether any fund-holding pattern needs NBE approval.
4. SMS provider for OTP (local aggregator vs Ethio Telecom bulk SMS) and cost per SMS.
5. Hosting: local data centre for the primary DB (PDPP), CDN for images.
6. Video hosting: local storage + CDN costs per GB; data localisation for user videos under PDPP.
7. Legal opinion on gifting (pay-per-gift vs stored value) and on the platform paying out creators and vendors.
8. Moderation staffing: Amharic, Afaan Oromo and Tigrinya-speaking moderators, 7 days a week.
9. Automated screening provider for images/video and Amharic text.
