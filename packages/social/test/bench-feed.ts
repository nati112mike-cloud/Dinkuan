/**
 * CLAUDE.md rule 19: feed and reels endpoints respond in < 300 ms at p95 with 100k posts.
 * Seeds the social test database (it wipes it) and times the feed queries.
 *   pnpm --filter @dinkuan/social bench
 */
import { prisma } from "@dinkuan/db";
import { followingFeed, forYouFeed, reelsFeed } from "../src";

// This wipes the database it runs on, so it only runs against a *_test database.
if (!/_test(\?|$)/.test(process.env.DATABASE_URL ?? "")) {
  console.error("Set DATABASE_URL to a *_test database, e.g. postgresql://postgres:postgres@localhost:5432/dinkuan_social_test");
  process.exit(1);
}
const POSTS = Number(process.env.BENCH_POSTS ?? 100_000);
const USERS = 1000;
const RUNS = 60;

async function seed() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await prisma.$executeRaw`
    INSERT INTO users (id, phone, name, lang)
    SELECT gen_random_uuid(), '+2519' || lpad(g::text, 8, '0'), 'User ' || g, 'am' FROM generate_series(1, ${USERS}) g`;
  await prisma.$executeRaw`
    INSERT INTO profiles (user_id, username, display_name, referral_code, is_private)
    SELECT id, 'user_' || substr(phone, 6), name, 'R' || substr(phone, 6), (random() < 0.1) FROM users`;
  // Each user follows ~50 random others; ~2% block someone; ~2% mute someone.
  await prisma.$executeRaw`
    INSERT INTO follows (follower_id, followee_id, status)
    SELECT DISTINCT a.id, b.id, 'active'::"FollowStatus" FROM users a
    JOIN LATERAL (SELECT id FROM users WHERE id <> a.id ORDER BY random() LIMIT 50) b ON true`;
  await prisma.$executeRaw`
    INSERT INTO blocks (blocker_id, blocked_id)
    SELECT a.id, (SELECT id FROM users WHERE id <> a.id ORDER BY random() LIMIT 1) FROM users a WHERE random() < 0.02`;
  await prisma.$executeRaw`
    INSERT INTO mutes (muter_id, muted_id)
    SELECT a.id, (SELECT id FROM users WHERE id <> a.id ORDER BY random() LIMIT 1) FROM users a WHERE random() < 0.02`;
  await prisma.$executeRaw`
    WITH u AS (SELECT id, row_number() OVER () AS n FROM users)
    INSERT INTO posts (id, author_id, type, caption, audience, status, reaction_count, comment_count, view_count, created_at, rank_key)
    SELECT gen_random_uuid(), u.id,
      (CASE WHEN g % 5 = 0 THEN 'reel' ELSE 'text' END)::"PostType",
      'post ' || g,
      (CASE WHEN g % 10 = 0 THEN 'followers' ELSE 'public' END)::"PostAudience",
      (CASE WHEN g % 50 = 0 THEN 'restricted' ELSE 'public' END)::"ContentStatus",
      (random() * 200)::int, (random() * 30)::int, (random() * 5000)::int,
      now() - (random() * interval '60 days'), 0
    FROM generate_series(1, ${POSTS}) g JOIN u ON u.n = 1 + (g % ${USERS})`;
  await prisma.$executeRaw`
    UPDATE posts SET rank_key = ln((reaction_count + 2 * comment_count + 1)::float / (view_count + 20))
      + extract(epoch FROM created_at) / 3600 * ln(2) / 24`;
  await prisma.$executeRaw`ANALYZE`;
}

async function time(label: string, fn: () => Promise<unknown>) {
  const ms: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t = performance.now();
    await fn();
    ms.push(performance.now() - t);
  }
  ms.sort((a, b) => a - b);
  const p95 = ms[Math.floor(ms.length * 0.95)]!;
  console.log(`${label.padEnd(28)} p50 ${ms[Math.floor(ms.length / 2)]!.toFixed(1)} ms   p95 ${p95.toFixed(1)} ms`);
  return p95;
}

async function main() {
  console.log(`Seeding ${POSTS} posts, ${USERS} users...`);
  await seed();
  const viewers = (await prisma.user.findMany({ take: RUNS, select: { id: true } })).map((u) => u.id);
  let i = 0;
  const next = () => viewers[i++ % viewers.length]!;
  const page3: [string, string | null][] = [];
  for (const v of viewers.slice(0, 20)) {
    const p1 = await forYouFeed(v);
    const p2 = await forYouFeed(v, p1.nextCursor);
    page3.push([v, p2.nextCursor]);
  }
  const results = [
    await time("For You (logged out)", () => forYouFeed(null)),
    await time("For You (member)", () => forYouFeed(next())),
    await time("For You page 3 (member)", async () => {
      const [v, cursor] = page3[i++ % page3.length]!;
      return forYouFeed(v, cursor);
    }),
    await time("Following (member)", () => followingFeed(next())),
    await time("Reels (member)", () => reelsFeed(next())),
  ];
  const worst = Math.max(...results);
  console.log(worst < 300 ? `OK: worst p95 ${worst.toFixed(1)} ms < 300 ms` : `SLOW: worst p95 ${worst.toFixed(1)} ms`);
  await prisma.$disconnect();
  if (worst >= 300) process.exit(1);
}

void main();
