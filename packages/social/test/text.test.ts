import { describe, expect, it } from "vitest";
import { matchesHiddenWord, normalizeUsername, parseHashtags, parseMentions, rankKey, scoreAt, usernameBase } from "../src/text";

const base = { reactionCount: 10, commentCount: 2, shareCount: 1, completions: 0, viewCount: 100, addisTagged: false };

describe("text helpers", () => {
  it("F14-AC1: usernames allow Latin letters, numbers, _ and . only", () => {
    expect(normalizeUsername("@Selam.Beats")).toBe("selam.beats");
    expect(normalizeUsername("dj_kaleb_2")).toBe("dj_kaleb_2");
    expect(normalizeUsername("ሰላም")).toBeNull();
    expect(normalizeUsername("ab")).toBeNull();
    expect(normalizeUsername("has space")).toBeNull();
    expect(normalizeUsername(".dot")).toBeNull();
    expect(normalizeUsername("admin")).toBeNull();
    expect(usernameBase("ሃና ተስፋዬ")).toBe("member");
    expect(usernameBase("Hanna Tesfaye")).toBe("hanna_tesfaye");
  });

  it("F15-AC2: hashtags in Amharic and English, and @mentions", () => {
    expect(parseHashtags("ምርጥ ምሽት #ድንኳን #AddisNights #addisnights")).toEqual(["ድንኳን", "addisnights"]);
    expect(parseMentions("with @DJ_Kaleb and @selam.beats, email a@b.com")).toEqual(["dj_kaleb", "selam.beats"]);
  });

  it("F16-AC3: keyword filter matches case-insensitively", () => {
    expect(matchesHiddenWord("This is SPAMMY stuff", ["spammy"])).toBe(true);
    expect(matchesHiddenWord("all good", ["spammy", " "])).toBe(false);
  });

  it("F16-AC6: recency decay halves the score every 24 hours and never reorders on its own", () => {
    const now = new Date("2026-09-25T12:00:00Z");
    const fresh = { ...base, createdAt: now };
    const dayOld = { ...base, createdAt: new Date(now.getTime() - 24 * 3600_000) };
    expect(scoreAt(dayOld, now) / scoreAt(fresh, now)).toBeCloseTo(0.5, 6);
    expect(rankKey(fresh)).toBeGreaterThan(rankKey(dayOld));
  });

  it("F16-AC6: engagement and the Addis locality boost raise the score", () => {
    const now = new Date();
    const quiet = { ...base, reactionCount: 0, commentCount: 0, shareCount: 0, createdAt: now };
    const busy = { ...base, reactionCount: 50, createdAt: now };
    expect(rankKey(busy)).toBeGreaterThan(rankKey(quiet));
    expect(rankKey({ ...quiet, addisTagged: true })).toBeGreaterThan(rankKey(quiet));
  });
});
