import { readFileSync } from "node:fs";

/**
 * F22-AC2 keyword lists for text screening, in English, Amharic and Afaan Oromo.
 *
 * The built-in lists are deliberately short: a starter set of unambiguous threats, spam and
 * child-safety terms. Slurs and hate terms change fast and depend on local context, so the
 * trust-and-safety team keeps the full, vetted lists in a JSON file named by
 * MODERATION_TERMS_FILE ({ "hate": ["…"], "threat": ["…"], … }), which is merged in at start-up.
 */
export const CATEGORIES = ["child_safety", "threat", "hate", "sexual", "scam", "spam"] as const;
export type Category = (typeof CATEGORIES)[number];

/** 1 low · 2 medium · 3 high · 4 urgent. Urgent reports are due in 1 hour, the rest in 24 (F22-AC7). */
export const CATEGORY_SEVERITY: Record<Category, number> = {
  child_safety: 4,
  threat: 4,
  hate: 4,
  sexual: 2,
  scam: 2,
  spam: 1,
};

const BUILT_IN: Record<Category, string[]> = {
  child_safety: [
    "child porn",
    "kiddie porn",
    "underage nudes",
    "underage sex",
    "preteen nudes",
    "cp for sale",
    "የህፃናት ወሲብ",
  ],
  threat: [
    "i will kill you",
    "i'll kill you",
    "im going to kill you",
    "i am going to kill you",
    "you will die tonight",
    "i know where you live",
    "i will shoot you",
    "i will stab you",
    "እገድልሃለሁ",
    "እገድልሻለሁ",
    "እገድላችኋለሁ",
    "ትሞታለህ",
    "sin ajjeesa",
    "isin ajjeesa",
  ],
  hate: [],
  sexual: ["send nudes", "nudes for sale", "onlyfans leak"],
  scam: [
    "double your money",
    "guaranteed profit",
    "send birr to win",
    "you have won a prize",
    "crypto giveaway",
    "free money",
    "ገንዘብዎን በእጥፍ",
  ],
  spam: [],
};

/** Link shorteners and invite links used by spam accounts. Matched on the normalised text. */
export const SPAM_PATTERNS: RegExp[] = [
  /\bbit\.ly\//,
  /\btinyurl\.com\//,
  /\bcutt\.ly\//,
  /\bshorturl\.at\//,
  /\bt\.me\/\+/,
  /\bchat\.whatsapp\.com\//,
];

function loadExtra(): Partial<Record<Category, string[]>> {
  const file = process.env.MODERATION_TERMS_FILE;
  if (!file) return {};
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    const out: Partial<Record<Category, string[]>> = {};
    for (const c of CATEGORIES) {
      const v = parsed[c];
      if (Array.isArray(v)) out[c] = v.filter((x): x is string => typeof x === "string" && x.trim().length > 1);
    }
    return out;
  } catch (e) {
    // A broken list must not silently turn screening off: fail loudly at start-up.
    throw new Error(`MODERATION_TERMS_FILE could not be read: ${(e as Error).message}`);
  }
}

let cached: Record<Category, string[]> | null = null;

export function termLists(): Record<Category, string[]> {
  if (!cached) {
    const extra = loadExtra();
    cached = Object.fromEntries(CATEGORIES.map((c) => [c, [...BUILT_IN[c], ...(extra[c] ?? [])]])) as Record<Category, string[]>;
  }
  return cached;
}

/** Tests only: add terms to a category, as a trust-and-safety list file would. */
export function addTermsForTest(category: Category, terms: string[]) {
  termLists()[category].push(...terms);
}
