/** Opaque keyset cursor. */
export function encodeCursor(v: Record<string, string | number>): string {
  return Buffer.from(JSON.stringify(v)).toString("base64url");
}

export function decodeCursor<T>(c: string | null | undefined): T | null {
  if (!c) return null;
  try {
    return JSON.parse(Buffer.from(c, "base64url").toString()) as T;
  } catch {
    return null;
  }
}
