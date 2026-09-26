import { prisma } from "@dinkuan/db";
import { DomainError } from "../errors";

/** How many requests each action allows per window. Keys are per IP or per member (see callers). */
export const RATE_LIMITS = {
  /** Stops SMS pumping across many numbers from one place (the per-number cap is in auth.ts). */
  otpRequestIp: { limit: 10, windowSec: 3600 },
  /** Stops code guessing across many numbers from one place (per number: 5 attempts). */
  otpVerifyIp: { limit: 30, windowSec: 900 },
  checkoutUser: { limit: 20, windowSec: 3600 },
  uploadUser: { limit: 60, windowSec: 3600 },
  exportUser: { limit: 5, windowSec: 3600 },
  searchIp: { limit: 120, windowSec: 60 },
  adEventIp: { limit: 600, windowSec: 3600 },
  /** Logged-out reel views (signed-in views count once a day per post). */
  viewIp: { limit: 300, windowSec: 3600 },
} as const;
export type RateLimitName = keyof typeof RATE_LIMITS;

export class RateLimitError extends DomainError {
  constructor(public readonly retryAfterSec: number) {
    super("RATE_LIMITED");
  }
}

/**
 * Counts one request against `name` for `subject` (an IP or a user id) in a fixed window, in a
 * single upsert so parallel requests can't slip past. Throws RATE_LIMITED once over the limit.
 */
export async function hitRateLimit(name: RateLimitName, subject: string, now = new Date()) {
  const { limit, windowSec } = RATE_LIMITS[name];
  const windowMs = windowSec * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const key = `${name}:${subject}`;
  const [row] = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
    RETURNING count`;
  if ((row?.count ?? 0) > limit) {
    throw new RateLimitError(Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000)));
  }
}

/** Housekeeping for the reconcile cron: windows that ended over a day ago. */
export async function pruneRateLimits(now = new Date()) {
  const { count } = await prisma.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 86400_000) } } });
  return count;
}
