/**
 * Text normalisation for keyword screening, so simple tricks don't get past the lists:
 * case, zero-width characters, look-alike digits, stretched letters, and Ethiopic letters
 * that sound the same (ሀ/ሐ/ኀ, ሰ/ሠ, አ/ዐ, ጸ/ፀ) and are used interchangeably.
 */

const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;

// Ethiopic syllables come in families of 8 code points (one per vowel order).
const ETHIOPIC_FOLD: [from: number, to: number][] = [
  [0x1210, 0x1200], // ሐ → ሀ
  [0x1280, 0x1200], // ኀ → ሀ
  [0x1220, 0x1230], // ሠ → ሰ
  [0x12d0, 0x12a0], // ዐ → አ
  [0x1340, 0x1338], // ፀ → ጸ
];

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

function foldEthiopic(ch: string): string {
  const cp = ch.codePointAt(0)!;
  for (const [from, to] of ETHIOPIC_FOLD) {
    if (cp >= from && cp < from + 8) return String.fromCodePoint(to + (cp - from));
  }
  // ሃ and ኣ (4th order) are pronounced like ሀ and አ (1st order).
  if (cp === 0x1203) return "ሀ";
  if (cp === 0x12a3) return "አ";
  return ch;
}

/** Ethiopic digits ፩–፱ to ASCII, so "፭" in a phone number or price still matches. */
function ethiopicDigit(ch: string): string {
  const cp = ch.codePointAt(0)!;
  return cp >= 0x1369 && cp <= 0x1371 ? String(cp - 0x1368) : ch;
}

/** Lowercase, strip invisible characters, fold look-alikes and collapse whitespace. */
export function normalise(text: string): string {
  const base = text.normalize("NFKC").replace(ZERO_WIDTH, "").toLowerCase();
  let out = "";
  for (const ch of base) out += foldEthiopic(ethiopicDigit(ch));
  return out.replace(/\s+/g, " ").trim();
}

/**
 * A second, looser form for Latin words: look-alike digits become letters, punctuation between
 * letters is dropped and repeated letters collapse ("k1lll" → "kil"). Terms go through the same
 * function, so "kill" and "kiiiilll" meet at "kil". Only used for matching, never shown to anyone.
 */
export function squash(text: string): string {
  return normalise(text)
    .replace(/[013457@$]/g, (c) => LEET[c] ?? c)
    .replace(/(?<=\p{L})[._*\-']+(?=\p{L})/gu, "")
    .replace(/(\p{L})\1+/gu, "$1");
}
