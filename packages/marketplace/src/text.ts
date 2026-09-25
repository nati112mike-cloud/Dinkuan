/**
 * Pure marketplace helpers, safe to import in the browser (no database access).
 */

export const VENDOR_TYPES = [
  "dj",
  "photographer",
  "videographer",
  "planner",
  "mc",
  "decor",
  "sound_lighting",
  "makeup",
  "band",
] as const;
export type VendorTypeKey = (typeof VENDOR_TYPES)[number];

export const VENDOR_TYPE_ICON: Record<VendorTypeKey, string> = {
  dj: "🎧",
  photographer: "📸",
  videographer: "🎥",
  planner: "📋",
  mc: "🎤",
  decor: "💐",
  sound_lighting: "🔊",
  makeup: "💄",
  band: "🎷",
};

export const LEVELS = ["new", "rising", "top_rated", "pro"] as const;
export type LevelKey = (typeof LEVELS)[number];

export const TIERS = ["basic", "standard", "premium"] as const;
export type TierKey = (typeof TIERS)[number];

export const SORTS = ["recommended", "top_rated", "price_asc", "most_booked"] as const;
export type SortKey = (typeof SORTS)[number];

export const AREAS = [
  "Addis Ketema",
  "Akaky Kaliti",
  "Arada",
  "Bole",
  "Gullele",
  "Kirkos",
  "Kolfe Keranio",
  "Lemi Kura",
  "Lideta",
  "Nifas Silk-Lafto",
  "Yeka",
] as const;

export const LANGUAGES = ["Amharic", "English", "Afaan Oromo", "Tigrinya"] as const;

export const MAX_COMPARE = 3;
export const MAX_TIERS = 3;
export const REQUEST_NOTES_MAX = 1000;
export const MESSAGE_MAX = 2000;

// ---------------------------------------------------------------------------
// F20-AC7 levels.

export interface LevelStats {
  completedBookings: number;
  /** Stars × 100 (e.g. 4.8 → 480). */
  ratingAvg: number;
  ratingCount: number;
  /** Share of requests answered, in basis points (9000 = 90%). */
  responseRateBps: number;
  cancellations: number;
}

/**
 * New → Rising → Top Rated → ድንኳን Pro, earned by completed bookings, rating ≥ 4.7, response
 * rate and zero cancellations (F20-AC7). The thresholds are the demo's; tune before launch.
 */
export function levelFor(s: LevelStats): LevelKey {
  const clean = s.cancellations === 0;
  const rated = s.ratingCount >= 3 && s.ratingAvg >= 470;
  if (s.completedBookings >= 50 && rated && s.responseRateBps >= 9500 && clean) return "pro";
  if (s.completedBookings >= 20 && rated && s.responseRateBps >= 9000 && clean) return "top_rated";
  if (s.completedBookings >= 5 && s.responseRateBps >= 8000) return "rising";
  return "new";
}

/** Recommended sort (F20-AC10): rating, volume, responsiveness and a small head start for new vendors. */
export function qualityScore(v: {
  ratingAvg: number;
  ratingCount: number;
  bookingsCount: number;
  responseRateBps: number;
  verifiedGigs: number;
}): number {
  // Bayesian average pulls vendors with few reviews towards 4.0 stars.
  const prior = 5;
  const stars = (v.ratingAvg * v.ratingCount + 400 * prior) / (v.ratingCount + prior) / 100;
  return (
    stars * 20 + Math.log10(v.bookingsCount + 1) * 10 + (v.responseRateBps / 10000) * 10 + Math.min(v.verifiedGigs, 10)
  );
}

export function formatStars(ratingAvg: number): string {
  return (ratingAvg / 100).toFixed(1);
}

// ---------------------------------------------------------------------------
// CLAUDE.md rule 16 / F20-AC15: contact details are masked in marketplace chat until a deposit
// is paid: phone numbers (ASCII, Ethiopic and other digits, and numbers spelled out in English
// or Amharic), @handles, links and email addresses.

export const MASK = "••••";

/** Digit words people use to dodge filters. Each counts as one digit. */
const DIGIT_WORDS = new Set([
  // English
  "zero",
  "oh",
  "o",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "double",
  "triple",
  // Amharic
  "ዜሮ",
  "ዜሮው",
  "አንድ",
  "ሁለት",
  "ሶስት",
  "ሦስት",
  "አራት",
  "አምስት",
  "ስድስት",
  "ሰባት",
  "ስምንት",
  "ዘጠኝ",
  "አስር",
  "አሥር",
  "ደብል",
]);

/** ASCII, Ethiopic (፩–፼), Arabic-Indic and full-width digits. */
const DIGIT_CHAR = /[0-9፩-፼٠-٩۰-۹０-９]/u;
const DIGIT_CHARS = /[0-9፩-፼٠-٩۰-۹０-９]/gu;
/** Characters people put between phone digits. */
const JOINERS = /^[\s\-–—._/\\()[\]+*|,:;~]+$/u;
/** A token made only of digits and joiners, e.g. "0911-23", "(0911)", "+251". */
const NUMERIC_TOKEN = /^[+(]?[0-9፩-፼٠-٩۰-۹０-９][0-9፩-፼٠-٩۰-۹０-９\-–—._/(),]*$/u;
/**
 * Numbers that look like prices (up to 8 digits with thousands separators) or dates. On their
 * own they are left alone; next to other digits they still count towards a phone number.
 */
const WEAK_NUMBER = [/^[1-9]\d{0,2}(,\d{3}){1,2}(\.\d+)?$/, /^\d{4}-\d{1,2}-\d{1,2}$/, /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/];
/** Seven digits is the shortest Ethiopian subscriber number. */
const MIN_PHONE_DIGITS = 7;

const URL_PATTERNS: RegExp[] = [
  // Links with a scheme, www., or t.me / wa.me style short links.
  /\b(?:https?:\/\/|www\.)\S+/giu,
  /\b(?:t|wa|telegram|instagram|facebook|fb|tiktok)\s*\.\s*(?:me|com|gg)\s*\/\s*\S+/giu,
  // Email addresses, including "name (at) gmail (dot) com".
  /[\p{L}\p{N}._%+-]+\s*(?:@|\(at\)|\[at\]|\sat\s)\s*[\p{L}\p{N}-]+\s*(?:\.|\(dot\)|\[dot\]|\sdot\s|ነጥብ)\s*[a-z]{2,}\b/giu,
  // Bare domains like example.com/path or someone.et.
  /\b[a-z0-9-]+(?:\s*\.\s*[a-z0-9-]+)*\s*(?:\.|\(dot\)|\[dot\]|\sdot\s)\s*(?:com|net|org|et|me|io|co|app|link|ly|gl|info|biz|site)\b(?:\/\S*)?/giu,
  // @handles (Latin or Ethiopic letters).
  /(?<![\p{L}\p{N}])[@＠]\s?[\p{L}\p{N}_.]{2,}/gu,
];

export interface MaskResult {
  text: string;
  masked: boolean;
}

/** Hides phone numbers, handles, links and emails in a chat message. */
export function maskContacts(input: string): MaskResult {
  let text = input.normalize("NFKC");
  let masked = false;
  for (const re of URL_PATTERNS) {
    text = text.replace(re, () => {
      masked = true;
      return MASK;
    });
  }
  const phones = maskPhoneRuns(text);
  return { text: phones.text, masked: masked || phones.masked };
}

function digitsIn(token: string): number {
  if (DIGIT_WORDS.has(token.toLowerCase())) return 1;
  if (!NUMERIC_TOKEN.test(token)) return -1;
  return token.match(DIGIT_CHARS)?.length ?? 0;
}

const isWeak = (token: string) => WEAK_NUMBER.some((re) => re.test(token));

/**
 * Walks the message token by token. A run of digit tokens, digit words and joiners that adds
 * up to seven or more digits is a phone number and is replaced as a whole.
 */
function maskPhoneRuns(text: string): MaskResult {
  // Split digits away from letters so "call0911223344" and "ቁጥሬ0911..." are caught too.
  // Hyphenated digit words ("Zero-Nine-One") are split into words as well.
  const parts = text
    .split(/(\s+|[;:|~*]|,(?!\d))/u)
    .flatMap((p) => p.split(/(?<=\p{L})(?=\d)|(?<=\d)(?=\p{L})|(?<=\p{L})([-–—._])(?=\p{L})/u))
    .filter((p): p is string => p !== undefined);
  const out: string[] = [];
  let run: string[] = [];
  let runDigits = 0;
  let runStrong = false;
  let pendingJoiners: string[] = [];
  let masked = false;

  const flush = () => {
    if (runDigits >= MIN_PHONE_DIGITS && runStrong) {
      out.push(MASK);
      masked = true;
    } else out.push(...run);
    out.push(...pendingJoiners);
    run = [];
    runDigits = 0;
    runStrong = false;
    pendingJoiners = [];
  };

  for (const [i, part] of parts.entries()) {
    if (part === "") continue;
    if (JOINERS.test(part)) {
      if (run.length) pendingJoiners.push(part);
      else out.push(part);
      continue;
    }
    const d = digitsIn(part);
    // A lone word like "o" or "one" only counts when it continues a run of digits.
    const isWord = !DIGIT_CHAR.test(part);
    if (d > 0 && !(isWord && run.length === 0 && !startsRun(parts, i))) {
      run.push(...pendingJoiners, part);
      pendingJoiners = [];
      runDigits += d;
      if (!isWeak(part)) runStrong = true;
    } else {
      flush();
      out.push(part);
    }
  }
  flush();
  return { text: out.join(""), masked };
}

/** A digit word starts a run only when the next non-joiner token is also a digit. */
function startsRun(parts: string[], i: number): boolean {
  for (let j = i + 1; j < parts.length; j++) {
    const p = parts[j]!;
    if (p === "" || JOINERS.test(p)) continue;
    return digitsIn(p) > 0;
  }
  return false;
}
