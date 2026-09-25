/**
 * F1-AC1: accept 09XXXXXXXX, 07XXXXXXXX, +2519..., +2517... (and a few common variants)
 * and normalise to E.164. Returns null when the number is not a valid Ethiopian mobile number.
 */
export function normalizeEthiopianPhone(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, "");
  let national: string | null = null;
  if (/^\+251[79]\d{8}$/.test(digits)) national = digits.slice(4);
  else if (/^251[79]\d{8}$/.test(digits)) national = digits.slice(3);
  else if (/^0[79]\d{8}$/.test(digits)) national = digits.slice(1);
  else if (/^[79]\d{8}$/.test(digits)) national = digits;
  return national ? `+251${national}` : null;
}

/** Show only the last 4 digits, e.g. "+251 •••• 1234". */
export function maskPhone(e164: string): string {
  return `+251 •••• ${e164.slice(-4)}`;
}
