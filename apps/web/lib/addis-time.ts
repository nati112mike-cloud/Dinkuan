/** `<input type="datetime-local">` values are Addis Ababa wall time (UTC+3, no daylight saving). */
export function toAddisInput(d: Date | string | null | undefined) {
  if (!d) return "";
  return new Date(new Date(d).getTime() + 3 * 3600_000).toISOString().slice(0, 16);
}

export function fromAddisInput(v: string) {
  return v ? `${v}:00+03:00` : null;
}
