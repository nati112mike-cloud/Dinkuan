import { prisma, type Prisma } from "@dinkuan/db";
import { generateSigningKeyPair, qrWindow, signQr, STATIC_WINDOW, toBase64Url } from "../qr";
import { decryptSecret, encryptSecret } from "./crypto";

/** Creates the event's Ed25519 key pair if it does not have one yet (F6-AC2). */
export async function ensureEventSigningKey(eventId: string, tx: Prisma.TransactionClient = prisma) {
  const existing = await tx.eventSigningKey.findUnique({ where: { eventId } });
  if (existing) return;
  const { privateKey, publicKey } = await generateSigningKeyPair();
  await tx.eventSigningKey.create({ data: { eventId, privateKeyEncrypted: encryptSecret(privateKey) } });
  await tx.event.update({ where: { id: eventId }, data: { signingPublicKey: toBase64Url(publicKey) } });
}

async function privateKeyFor(eventId: string): Promise<Uint8Array> {
  const key = await prisma.eventSigningKey.findUnique({ where: { eventId } });
  if (!key) throw new Error(`Event ${eventId} has no signing key`);
  return decryptSecret(key.privateKeyEncrypted);
}

/**
 * QR codes for a ticket: the static fallback (Telegram/SMS) and a batch of rotating codes,
 * one per 30-second window, so the wallet keeps rotating while offline for `minutes`.
 */
export async function ticketQrCodes(
  ticket: { id: string; eventId: string; version: number },
  opts: { now?: Date; minutes?: number } = {},
): Promise<{ static: string; rotating: { window: number; payload: string }[] }> {
  const pk = await privateKeyFor(ticket.eventId);
  const now = opts.now ?? new Date();
  const count = Math.ceil(((opts.minutes ?? 60) * 60) / 30);
  const start = qrWindow(now);
  const fields = { ticketId: ticket.id, eventId: ticket.eventId, version: ticket.version };
  const rotating = await Promise.all(
    Array.from({ length: count }, async (_, i) => ({
      window: start + i,
      payload: await signQr({ ...fields, window: start + i }, pk),
    })),
  );
  return { static: await signQr({ ...fields, window: STATIC_WINDOW }, pk), rotating };
}
