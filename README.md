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

Demo accounts (code `123456`):

| Phone | Role |
|---|---|
| 0911000001 | Buyer |
| 0911000002 | Gate scanner for both demo organisers |
| 0911000003 | Organiser (Addis Nights Entertainment) |
| 0911000004 | Admin |

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

Re-run `pnpm db:seed` any time: it moves the demo events so "Tonight" and "This weekend" always have something on.

## Checks

```bash
pnpm lint && pnpm typecheck && pnpm test   # unit + database integration tests
pnpm test:e2e                              # Playwright: buyer journey and offline gate scanning
```

Integration tests use a separate `dinkuan_test` database (`TEST_DATABASE_URL`).
