import * as ed from "@noble/ed25519";
import { fromBase64Url, toBase64Url } from "./base64url";

/**
 * Ticket QR payloads (PRD F6-AC2/AC3):
 *   ticketId.eventId.version.window.signature
 * window = floor(unixSeconds / 30) for the rotating in-app QR, or 0 for the static
 * fallback sent by Telegram/SMS. The signature is Ed25519 over the other fields,
 * made with the event's private key, which never leaves the server.
 */
export const QR_WINDOW_SECONDS = 30;
/** Rotating QRs are accepted for this many windows either side of "now" (clock drift at the gate). */
export const QR_WINDOW_TOLERANCE = 2;
export const STATIC_WINDOW = 0;

const encoder = new TextEncoder();

export function qrWindow(at: Date): number {
  return Math.floor(at.getTime() / 1000 / QR_WINDOW_SECONDS);
}

function message(ticketId: string, eventId: string, version: number, window: number): Uint8Array {
  return encoder.encode(`dk1|${ticketId}|${eventId}|${version}|${window}`);
}

export interface QrFields {
  ticketId: string;
  eventId: string;
  version: number;
  window: number;
}

export async function signQr(fields: QrFields, privateKey: Uint8Array): Promise<string> {
  const sig = await ed.signAsync(
    message(fields.ticketId, fields.eventId, fields.version, fields.window),
    privateKey,
  );
  return `${fields.ticketId}.${fields.eventId}.${fields.version}.${fields.window}.${toBase64Url(sig)}`;
}

export function parseQr(payload: string): (QrFields & { signature: Uint8Array }) | null {
  const parts = payload.trim().split(".");
  if (parts.length !== 5) return null;
  const [ticketId, eventId, versionStr, windowStr, sigStr] = parts as [string, string, string, string, string];
  if (!/^\d+$/.test(versionStr) || !/^\d+$/.test(windowStr)) return null;
  try {
    const signature = fromBase64Url(sigStr);
    if (signature.length !== 64) return null;
    return { ticketId, eventId, version: Number(versionStr), window: Number(windowStr), signature };
  } catch {
    return null;
  }
}

export type QrCheck =
  | { ok: true; fields: QrFields }
  | { ok: false; reason: "MALFORMED" | "WRONG_EVENT" | "BAD_SIGNATURE" | "EXPIRED_QR" };

/** Checks format, event, signature and time window. Ticket status/version checks are the caller's job. */
export async function verifyQr(
  payload: string,
  expected: { eventId: string; publicKey: Uint8Array; now: Date },
): Promise<QrCheck> {
  const parsed = parseQr(payload);
  if (!parsed) return { ok: false, reason: "MALFORMED" };
  if (parsed.eventId !== expected.eventId) return { ok: false, reason: "WRONG_EVENT" };
  const valid = await ed
    .verifyAsync(
      parsed.signature,
      message(parsed.ticketId, parsed.eventId, parsed.version, parsed.window),
      expected.publicKey,
    )
    .catch(() => false);
  if (!valid) return { ok: false, reason: "BAD_SIGNATURE" };
  if (parsed.window !== STATIC_WINDOW) {
    if (Math.abs(parsed.window - qrWindow(expected.now)) > QR_WINDOW_TOLERANCE) {
      return { ok: false, reason: "EXPIRED_QR" };
    }
  }
  const { signature: _s, ...fields } = parsed;
  return { ok: true, fields };
}

export async function generateSigningKeyPair(): Promise<{ privateKey: Uint8Array; publicKey: Uint8Array }> {
  const privateKey = ed.utils.randomSecretKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  return { privateKey, publicKey };
}

export { toBase64Url, fromBase64Url };
