/**
 * Money helpers. All amounts are integer santim (100 santim = 1 Birr).
 * Never use floats for money anywhere else in the codebase.
 */
export type Santim = number;

export const SANTIM_PER_BIRR = 100;

export function assertSantim(value: number): asserts value is Santim {
  if (!Number.isSafeInteger(value)) throw new Error(`Invalid santim amount: ${value}`);
}

export function birr(whole: number): Santim {
  const s = whole * SANTIM_PER_BIRR;
  assertSantim(s);
  return s;
}

/** Parse a Birr string like "150", "150.5" or "1,500.50" into santim without float maths. */
export function parseBirr(input: string): Santim {
  const clean = input.replace(/,/g, "").trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(clean);
  if (!match) throw new Error(`Invalid Birr amount: ${input}`);
  const whole = Number(match[1]);
  const frac = Number((match[2] ?? "").padEnd(2, "0"));
  const s = whole * SANTIM_PER_BIRR + frac;
  assertSantim(s);
  return s;
}

/** Format santim as Birr, e.g. 15050 -> "150.50". Whole Birr amounts drop the decimals. */
export function formatBirr(amount: Santim): string {
  assertSantim(amount);
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const whole = Math.floor(abs / SANTIM_PER_BIRR);
  const frac = abs % SANTIM_PER_BIRR;
  const wholeStr = whole.toLocaleString("en-US");
  const body = frac === 0 ? wholeStr : `${wholeStr}.${String(frac).padStart(2, "0")}`;
  return negative ? `-${body}` : body;
}

/** Percentage in basis points (500 bps = 5%), rounded half up to the nearest santim. */
export function applyBps(amount: Santim, bps: number): Santim {
  assertSantim(amount);
  if (!Number.isInteger(bps)) throw new Error(`Invalid bps: ${bps}`);
  return Math.floor((amount * bps + 5000) / 10000);
}

export function sumSantim(values: Santim[]): Santim {
  return values.reduce((a, b) => {
    const s = a + b;
    assertSantim(s);
    return s;
  }, 0);
}
