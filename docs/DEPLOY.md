# Hosting the demo (Vercel + Neon)

The demo runs on free tiers: **Neon** for PostgreSQL and **Vercel** for the web app and the scanner.
Both use Frankfurt (closest free region to Addis Ababa). Payments and SMS stay in demo mode.

## 1. Database (Neon)
1. Sign up at neon.tech with GitHub and create a project named `dinkuan`, region **Frankfurt (eu-central-1)**.
2. On the dashboard, copy two connection strings:
   - **Pooled** (host contains `-pooler`): used by the web app.
   - **Direct** (untick "Connection pooling"): used for migrations and seeding.

## 2. Secrets
Generate two random values (any password generator works, or `openssl rand -base64 32`):
- `KEY_ENCRYPTION_SECRET` — must be 32 bytes base64. **Use the same value everywhere below**; tickets can't be signed if it differs.
- `SESSION_SECRET` — any long random string.

In GitHub: repo → Settings → Secrets and variables → Actions → New repository secret:
- `DEMO_DATABASE_URL` = the **direct** Neon string
- `DEMO_KEY_ENCRYPTION_SECRET` = the `KEY_ENCRYPTION_SECRET` above

Then Actions → **Demo database** → Run workflow. It creates the tables and the demo data, and re-runs every night at 03:00 Addis to keep event dates fresh.

## 3. Web app (Vercel)
1. Sign up at vercel.com with GitHub → Add New → Project → import `Dinkuan`.
2. Root directory: `apps/web`. Framework: Next.js (detected).
3. Environment variables:

| Name | Value |
|---|---|
| `DATABASE_URL` | the **pooled** Neon string |
| `APP_URL` | `https://<your-web-project>.vercel.app` |
| `SCANNER_ORIGIN` | `https://<your-scanner-project>.vercel.app` |
| `SESSION_SECRET` | from step 2 |
| `KEY_ENCRYPTION_SECRET` | from step 2 |
| `DEMO_MODE` | `true` |
| `DEMO_STAFF_CODE` | a 6-digit code only your team knows; the admin account signs in with it instead of 123456 |
| `PAYMENT_WEBHOOK_SECRET` | any random string |
| `CRON_SECRET` | any random string |

4. Deploy. `vercel.json` pins functions to Frankfurt and runs payment reconciliation once a day (the Hobby plan limit); expired reservations are also released whenever someone checks out.

## 4. Scanner (Vercel, second project)
1. Add New → Project → import `Dinkuan` again.
2. Root directory: `apps/scanner`. Framework: Vite.
3. Environment variable: `VITE_API_URL` = `https://<your-web-project>.vercel.app`.
4. Deploy, then make sure the web project's `SCANNER_ORIGIN` matches this URL and redeploy the web project if you changed it.

## Demo logins
Code **123456** for buyer `0911000001`, gate staff `0911000002` and organiser `0911000003`. The admin account `0911000004` uses your `DEMO_STAFF_CODE`, so people you share the link with can't open the admin panel. Tell visitors not to type real phone numbers into the demo.

The live (non-demo) site must set `APP_ENV=production`; with that set, `DEMO_MODE=true` stops the app from serving anything, so a demo switch can never leak into production.
