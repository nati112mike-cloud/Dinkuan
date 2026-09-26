import { randomUUID } from "node:crypto";

/**
 * Structured logs and error reports. Logs are one JSON object per line on stdout/stderr, so a
 * Vercel log drain (or any log tool) can filter by level, route and request id. When SENTRY_DSN
 * is set, errors are also sent to Sentry. No request bodies, cookies, phone numbers or query
 * strings are logged (CLAUDE.md rule 12).
 */
type Fields = Record<string, string | number | boolean | null | undefined>;

export function log(level: "info" | "warn" | "error", msg: string, fields: Fields = {}) {
  const line = JSON.stringify({ level, msg, time: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Path only: query strings can carry codes or phone numbers. */
export function safePath(url: string | undefined | null) {
  if (!url) return undefined;
  try {
    return new URL(url, "http://x").pathname;
  } catch {
    return undefined;
  }
}

type Dsn = { endpoint: string; key: string; dsn: string };

export function parseDsn(dsn: string | undefined): Dsn | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const project = u.pathname.replace(/^\/+|\/+$/g, "");
    if (!u.username || !project) return null;
    return { endpoint: `${u.protocol}//${u.host}/api/${project}/envelope/`, key: u.username, dsn };
  } catch {
    return null;
  }
}

/** The Sentry envelope for one error event (https://develop.sentry.dev/sdk/envelopes/). */
export function sentryEnvelope(err: unknown, ctx: { path?: string; method?: string; requestId?: string }, dsn: string, now = new Date()) {
  const e = err instanceof Error ? err : new Error(String(err));
  const eventId = randomUUID().replace(/-/g, "");
  const event = {
    event_id: eventId,
    timestamp: now.getTime() / 1000,
    platform: "node",
    level: "error",
    environment: process.env.APP_ENV ?? "development",
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    exception: { values: [{ type: e.name, value: e.message.slice(0, 1000) }] },
    tags: { path: ctx.path, method: ctx.method, request_id: ctx.requestId },
    extra: { stack: e.stack?.slice(0, 8000) },
  };
  return [JSON.stringify({ event_id: eventId, sent_at: now.toISOString(), dsn }), JSON.stringify({ type: "event" }), JSON.stringify(event)].join("\n");
}

/** Logs an unexpected error and, when configured, reports it. Never throws. */
export async function reportError(err: unknown, ctx: { path?: string; method?: string; requestId?: string } = {}) {
  const e = err instanceof Error ? err : new Error(String(err));
  log("error", e.message, { name: e.name, path: ctx.path, method: ctx.method, requestId: ctx.requestId, stack: e.stack?.split("\n").slice(0, 6).join(" | ") });
  const dsn = parseDsn(process.env.SENTRY_DSN);
  if (!dsn) return;
  try {
    await fetch(dsn.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${dsn.key}, sentry_client=dinkuan/1.0`,
      },
      body: sentryEnvelope(err, ctx, dsn.dsn),
      signal: AbortSignal.timeout(3000),
    });
  } catch (sendErr) {
    log("warn", "error report failed", { reason: sendErr instanceof Error ? sendErr.message : String(sendErr) });
  }
}
