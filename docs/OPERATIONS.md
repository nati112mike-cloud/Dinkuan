# Operations runbook

How to see that ድንኳን is healthy, find out what went wrong, and recover data. Set-up steps for
the hosts themselves are in [DEPLOY.md](DEPLOY.md).

## Health check

`GET /api/health` returns `200 {"data":{"status":"ok","db":"ok",...}}` when the app can reach the
database, and `503` when it can't. Point a free uptime monitor (for example UptimeRobot or Better
Stack) at it every 5 minutes and have it alert by email or Telegram.

## Logs

Server logs are one JSON object per line (`level`, `msg`, `time`, `path`, `method`, `requestId`).
In Vercel: Project → Logs, filter by `level":"error"`. A log drain (Project → Settings → Log
Drains) can forward them to any log tool. Logs never contain request bodies, cookies, query
strings or phone numbers.

## Error tracking

Set `SENTRY_DSN` in the web project's environment variables to send unexpected errors (500s,
page render errors, Telegram failures) to Sentry. No SDK is bundled; errors are posted straight to
Sentry's envelope API. Leave it empty to only log them.

## Rate limits

Per-IP and per-member limits live in `packages/core/src/server/rate-limit.ts` (`RATE_LIMITS`):
login codes (10 requests an hour and 30 checks per 15 minutes per IP), checkout (20 an hour per
member), uploads (60 an hour), data export (5 an hour), people search (120 a minute per IP) and
promotion clicks and impressions (600 an hour per IP). Over the limit, APIs answer `429
RATE_LIMITED` with a `Retry-After` header. Posting, commenting, following, reporting and chat
have their own hourly caps in their packages.

The IP comes from `x-forwarded-for`, which Vercel sets. Behind another host, make sure the proxy
overwrites that header, or anyone can pick their own IP. Counters live in the `rate_limits` table;
the reconcile cron deletes windows older than a day.

## Security headers

Every web response carries a Content-Security-Policy (same-origin only, no framing), HSTS,
`nosniff`, `X-Frame-Options: DENY`, a strict referrer policy and a Permissions-Policy that turns
off camera, microphone and location. They are set in `apps/web/next.config.ts`. The scanner's
headers (camera allowed for itself) are in `apps/scanner/vercel.json`. If you add a script, font,
map or image from another domain, add that domain to the policy or the browser will block it.

## Backups

1. **Neon point-in-time restore**: Neon keeps a history of the database, so you can branch or
   restore to a moment before a mistake (Neon console → Branches → Restore). How far back depends
   on the Neon plan.
2. **Nightly encrypted dump** (`.github/workflows/backup.yml`, 02:30 Addis time, before the demo
   refresh): `pg_dump` of the database, encrypted with AES-256 using `BACKUP_PASSPHRASE`, checked
   by decrypting and listing it, then kept as a workflow artifact for 14 days. It needs two
   repository secrets: `BACKUP_DATABASE_URL` (or it falls back to `DEMO_DATABASE_URL`) and
   `BACKUP_PASSPHRASE` (a long random string, e.g. `openssl rand -base64 32`). Keep the
   passphrase somewhere safe outside GitHub too: without it the backups can't be opened.

### Restoring a dump

1. Download the artifact from the workflow run (Actions → Database backup → run → Artifacts).
2. Create an empty database (for example a new Neon branch or a local database).
3. Decrypt and restore:

   ```sh
   gpg --decrypt dinkuan-YYYYMMDDTHHMMZ.dump.gpg | pg_restore --no-owner --no-privileges -d "$TARGET_DATABASE_URL"
   ```

4. Check the counts (users, events, orders, ledger entries) look right, then point
   `DATABASE_URL` at it. Restores were rehearsed on 2026-09-26: every table came back with the same
   row counts.

Uploaded photos and videos are stored in the database in the demo (`media_blobs`), so they are in
the dump. When media moves to object storage, it needs its own backup.
