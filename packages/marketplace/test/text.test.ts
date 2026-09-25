import { describe, expect, it } from "vitest";
import { levelFor, maskContacts, MASK, qualityScore } from "../src/text";

const hidden = (s: string) => maskContacts(s);

describe("CLAUDE.md rule 16 / F20-AC15: contact masking", () => {
  it.each([
    "call me on 0911223344",
    "0911 22 33 44",
    "0911-223-344",
    "+251 911 223 344",
    "+251911223344",
    "(0911) 22-33-44",
    "0 9 1 1 2 2 3 3 4 4",
    "ቁጥሬ 0911223344 ነው",
    "ቁጥሬ0911223344",
    "zero nine one one two two three three four four",
    "Zero-Nine-One-One 22 33 44",
    "ዜሮ ዘጠኝ አንድ አንድ ሁለት ሁለት ሶስት ሶስት አራት አራት",
    "ዜሮ ዘጠኝ 11 22 33 44",
    "0911.22.33.44",
    "０９１１２２３３４４",
    "፱፩፩፪፪፫፫፬፬",
  ])("hides the phone number in %j", (msg) => {
    const r = hidden(msg);
    expect(r.masked).toBe(true);
    expect(r.text).toContain(MASK);
    expect(r.text).not.toMatch(/\d{3}/);
    expect(r.text).not.toMatch(/[፩-፼]{3}/u);
  });

  it.each([
    "@djkaleb",
    "find me on telegram @selam_beats",
    "DM ＠ሰላም_ቢትስ",
    "https://t.me/djkaleb",
    "t.me/djkaleb",
    "t . me / djkaleb",
    "www.djkaleb.com",
    "djkaleb.com/booking",
    "kaleb@gmail.com",
    "kaleb (at) gmail (dot) com",
    "kaleb at gmail dot com",
    "instagram.com/djkaleb",
  ])("hides the handle, link or email in %j", (msg) => {
    const r = hidden(msg);
    expect(r.masked).toBe(true);
    expect(r.text).toContain(MASK);
    expect(r.text.toLowerCase()).not.toContain("djkaleb");
    expect(r.text.toLowerCase()).not.toContain("gmail");
  });

  it.each([
    "Can you do 15 March, 6 pm to 11 pm?",
    "Our budget is 25,000 Br for 150 guests",
    "Budget 1,500,000 birr for the whole wedding",
    "The wedding is on 2026-03-15 at Hilton",
    "Date: 15/03/2026, around 300 people",
    "ሰላም! ለሰርግ 200 እንግዶች አሉን",
    "We need one DJ and two speakers",
    "I'm at the venue at 5",
  ])("leaves ordinary messages alone: %j", (msg) => {
    expect(hidden(msg)).toEqual({ text: msg, masked: false });
  });

  it("keeps the rest of the message readable", () => {
    const r = hidden("Hi! Call 0911 22 33 44 or @kaleb after 6pm");
    expect(r.text).toBe(`Hi! Call ${MASK} or ${MASK} after 6pm`);
  });
});

describe("F20-AC7 levels", () => {
  const base = { completedBookings: 0, ratingAvg: 0, ratingCount: 0, responseRateBps: 10000, cancellations: 0 };
  it("F20-AC7: New → Rising → Top Rated → ድንኳን Pro", () => {
    expect(levelFor(base)).toBe("new");
    expect(levelFor({ ...base, completedBookings: 6, responseRateBps: 8500 })).toBe("rising");
    expect(levelFor({ ...base, completedBookings: 25, ratingAvg: 480, ratingCount: 20, responseRateBps: 9200 })).toBe("top_rated");
    expect(levelFor({ ...base, completedBookings: 60, ratingAvg: 490, ratingCount: 40, responseRateBps: 9800 })).toBe("pro");
  });
  it("F20-AC7: a rating under 4.7 or any cancellation holds a vendor back", () => {
    const pro = { ...base, completedBookings: 60, ratingAvg: 490, ratingCount: 40, responseRateBps: 9800 };
    expect(levelFor({ ...pro, ratingAvg: 460 })).toBe("rising");
    expect(levelFor({ ...pro, cancellations: 1 })).toBe("rising");
  });
  it("F20-AC10: quality score rewards rating and track record, and few reviews count for less", () => {
    const a = qualityScore({ ratingAvg: 490, ratingCount: 40, bookingsCount: 60, responseRateBps: 9500, verifiedGigs: 4 });
    const b = qualityScore({ ratingAvg: 500, ratingCount: 1, bookingsCount: 1, responseRateBps: 9500, verifiedGigs: 0 });
    expect(a).toBeGreaterThan(b);
  });
});
