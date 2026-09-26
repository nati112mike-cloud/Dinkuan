import { isDemoMode } from "@dinkuan/core/server";
import { CATEGORY_SEVERITY, SPAM_PATTERNS, termLists, type Category } from "./lists";
import { normalise, squash } from "./normalise";

/**
 * F22-AC2 / CLAUDE.md rule 14: automated screening before anything goes public.
 * Clean content is `public`; anything that matches goes to the moderator queue as `restricted`;
 * child sexual content is `removed` at once (AC7).
 */
export type ScreenCategory = Category | "nudity" | "violence" | "media_review";
export type ScreenStatus = "public" | "restricted" | "removed";
export type ScreeningResult = { status: ScreenStatus; category?: ScreenCategory; severity: number; reason?: string };

export const CLEAN: ScreeningResult = { status: "public", severity: 0 };

const ETHIOPIC = /\p{Script=Ethiopic}/u;

function termPattern(term: string): { ethiopic: boolean; needle: string } {
  const ethiopic = ETHIOPIC.test(term);
  return { ethiopic, needle: ethiopic ? normalise(term) : squash(term) };
}

let compiled: { category: Category; needle: string; ethiopic: boolean }[] | null = null;
function terms() {
  if (!compiled) {
    compiled = Object.entries(termLists()).flatMap(([category, list]) =>
      list.map((t) => ({ category: category as Category, ...termPattern(t) })),
    );
  }
  return compiled;
}

/** Tests only: rebuild the term index after the lists change. */
export function resetScreenerCache() {
  compiled = null;
}

function containsWord(haystack: string, needle: string): boolean {
  let from = 0;
  for (;;) {
    const i = haystack.indexOf(needle, from);
    if (i < 0) return false;
    const before = haystack[i - 1];
    const after = haystack[i + needle.length];
    const isLetter = (c: string | undefined) => !!c && /\p{L}/u.test(c);
    if (!isLetter(before) && !isLetter(after)) return true;
    from = i + 1;
  }
}

function outcome(category: ScreenCategory, severity: number): ScreeningResult {
  return { status: category === "child_safety" ? "removed" : "restricted", category, severity, reason: category };
}

/** Screens text against the keyword lists and spam link patterns. The most severe match wins. */
export function screenText(text: string | null | undefined): ScreeningResult {
  if (!text?.trim()) return CLEAN;
  const plain = normalise(text);
  const loose = squash(text);
  let worst: Category | null = null;
  for (const t of terms()) {
    if (worst && CATEGORY_SEVERITY[t.category] <= CATEGORY_SEVERITY[worst]) continue;
    const hit = t.ethiopic ? plain.includes(t.needle) : containsWord(loose, t.needle);
    if (hit) worst = t.category;
  }
  if (!worst && SPAM_PATTERNS.some((p) => p.test(plain))) worst = "spam";
  return worst ? outcome(worst, CATEGORY_SEVERITY[worst]) : CLEAN;
}

// ---------------------------------------------------------------------------
// Images and video. A real classifier (nudity, graphic violence, CSAM hash matching) plugs in
// behind this interface; until one is configured, uploads outside demo mode wait for a person.

export type MediaLabel = { category: "nudity" | "violence" | "child_safety"; score: number };
export interface MediaScreener {
  screen(input: { contentType: string; bytes: Uint8Array }): Promise<MediaLabel[]>;
}

/** Scores at or above this send media to the queue; child-safety hits at this level are removed. */
export const MEDIA_THRESHOLD = 0.8;
const MEDIA_SEVERITY = { nudity: 2, violence: 2, child_safety: 4 } as const;

let provider: MediaScreener | null = null;

export function setMediaScreener(p: MediaScreener | null) {
  provider = p;
}

/** Callers skip loading media bytes when nothing will look at them. */
export function hasMediaScreener() {
  return provider !== null;
}

export async function screenMedia(items: { contentType: string; bytes: Uint8Array }[]): Promise<ScreeningResult> {
  if (items.length === 0) return CLEAN;
  if (!provider) {
    // Demo mode auto-approves uploads so the demo feels live; production never publishes unscreened media.
    return isDemoMode() ? CLEAN : { status: "restricted", category: "media_review", severity: 1, reason: "media_review" };
  }
  let worst: ScreeningResult = CLEAN;
  for (const item of items) {
    for (const label of await provider.screen(item)) {
      if (label.score < MEDIA_THRESHOLD) continue;
      const r = outcome(label.category, MEDIA_SEVERITY[label.category]);
      if (r.severity > worst.severity) worst = r;
    }
  }
  return worst;
}

/** Combines text and media results: the more severe one decides. */
export function worstOf(...results: ScreeningResult[]): ScreeningResult {
  return results.reduce((a, b) => (b.severity > a.severity || (b.status === "removed" && a.status !== "removed") ? b : a), CLEAN);
}
