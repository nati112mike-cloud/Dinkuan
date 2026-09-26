import { afterEach, describe, expect, it } from "vitest";
import { addTermsForTest, normalise, resetScreenerCache, screenMedia, screenText, setMediaScreener, squash, worstOf } from "../src";

describe("F22-AC2: text screening", () => {
  it("F22-AC2: clean captions in Amharic and English go public", () => {
    expect(screenText("ዛሬ ማታ በፈንዲካ ጥሩ ምሽት ነበር 🎶").status).toBe("public");
    expect(screenText("Who's coming to the Afro-house night at Mama Kitchen?").status).toBe("public");
    expect(screenText("").status).toBe("public");
  });

  it("F22-AC2: threats in English, Amharic and Afaan Oromo go to the queue as urgent", () => {
    for (const text of ["I will kill you after the show", "ነገ እገድልሃለሁ", "Ani sin ajjeesa"]) {
      const r = screenText(text);
      expect(r, text).toMatchObject({ status: "restricted", category: "threat", severity: 4 });
    }
  });

  it("F22-AC2: common disguises don't get past the list", () => {
    expect(screenText("I W1LL K1LLL YOU").category).toBe("threat");
    expect(screenText("i will k​ill you").category).toBe("threat");
    expect(screenText("i will k.i.l.l you").category).toBe("threat");
    // ሐ and ሀ families are interchangeable in everyday writing.
    expect(normalise("ሐ")).toBe(normalise("ሀ"));
    expect(normalise("ሠላም")).toBe(normalise("ሰላም"));
    // "skill you" is not "kill you".
    expect(screenText("I will skill you up at the workshop").status).toBe("public");
  });

  it("F22-AC2: spam links and scams are flagged", () => {
    expect(screenText("free tickets here bit.ly/abc123")).toMatchObject({ status: "restricted", category: "spam" });
    expect(screenText("Join t.me/+AbCdEf for promo")).toMatchObject({ category: "spam" });
    expect(screenText("Guaranteed profit, double your money!")).toMatchObject({ category: "scam", severity: 2 });
  });

  it("F22-AC7: child sexual content is removed outright, not just queued", () => {
    expect(screenText("selling child porn")).toMatchObject({ status: "removed", category: "child_safety", severity: 4 });
  });

  it("F22-AC2: the trust-and-safety list extends the built-in one", () => {
    expect(screenText("zzbadword here").status).toBe("public");
    addTermsForTest("hate", ["zzbadword"]);
    resetScreenerCache();
    expect(screenText("ZZBADWORD here")).toMatchObject({ status: "restricted", category: "hate", severity: 4 });
  });

  it("squash collapses repeats and look-alike digits the same way for terms and text", () => {
    expect(squash("kiiilll")).toBe(squash("kill"));
    expect(squash("K1ll")).toBe("kil");
  });
});

describe("F22-AC2: image and video screening", () => {
  const saved = process.env.DEMO_MODE;
  afterEach(() => {
    setMediaScreener(null);
    process.env.DEMO_MODE = saved;
  });
  const photo = { contentType: "image/jpeg", bytes: new Uint8Array([1, 2, 3]) };

  it("F22-AC2: without a classifier, uploads outside demo mode wait for a person", async () => {
    process.env.DEMO_MODE = "false";
    expect(await screenMedia([photo])).toMatchObject({ status: "restricted", category: "media_review" });
    process.env.DEMO_MODE = "true";
    expect((await screenMedia([photo])).status).toBe("public");
  });

  it("F22-AC2: nudity and graphic violence go to the queue; child sexual content is removed", async () => {
    setMediaScreener({ screen: async () => [{ category: "nudity", score: 0.93 }] });
    expect(await screenMedia([photo])).toMatchObject({ status: "restricted", category: "nudity" });
    setMediaScreener({ screen: async () => [{ category: "violence", score: 0.4 }] });
    expect((await screenMedia([photo])).status).toBe("public");
    setMediaScreener({ screen: async () => [{ category: "child_safety", score: 0.99 }] });
    expect(await screenMedia([photo])).toMatchObject({ status: "removed", severity: 4 });
  });

  it("the more severe of caption and media decides", () => {
    const r = worstOf(screenText("free money bit.ly/x"), { status: "removed", category: "child_safety", severity: 4 });
    expect(r.status).toBe("removed");
  });
});
