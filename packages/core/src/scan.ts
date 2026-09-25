import { verifyQr } from "./qr";

/**
 * Local gate verification (PRD F8-AC2/AC3). Runs fully offline against the scanner's pack.
 */
export interface PackTicket {
  id: string;
  version: number;
  status: "valid" | "checked_in" | "transferred" | "refunded" | "void";
  typeName: string;
  holderName: string;
  checkedInAt?: string | null;
}

export type ScanResult =
  | { valid: true; ticket: PackTicket }
  | {
      valid: false;
      reason: "FAKE" | "WRONG_EVENT" | "EXPIRED_QR" | "ALREADY_USED" | "REFUNDED" | "OLD_VERSION" | "VOID" | "UNKNOWN_TICKET";
      ticket?: PackTicket;
      usedAt?: string;
    };

export async function scanTicket(
  payload: string,
  ctx: {
    eventId: string;
    publicKey: Uint8Array;
    now: Date;
    findTicket: (id: string) => PackTicket | undefined;
    /** Local check-in time if this device (or a synced gate) already admitted the ticket. */
    localCheckIn: (id: string) => string | undefined;
  },
): Promise<ScanResult> {
  const check = await verifyQr(payload, { eventId: ctx.eventId, publicKey: ctx.publicKey, now: ctx.now });
  if (!check.ok) {
    if (check.reason === "WRONG_EVENT") return { valid: false, reason: "WRONG_EVENT" };
    if (check.reason === "EXPIRED_QR") return { valid: false, reason: "EXPIRED_QR" };
    return { valid: false, reason: "FAKE" };
  }
  const ticket = ctx.findTicket(check.fields.ticketId);
  if (!ticket) return { valid: false, reason: "UNKNOWN_TICKET" };
  if (ticket.status === "refunded") return { valid: false, reason: "REFUNDED", ticket };
  if (ticket.status === "void") return { valid: false, reason: "VOID", ticket };
  if (ticket.status === "transferred" || check.fields.version !== ticket.version) {
    return { valid: false, reason: "OLD_VERSION", ticket };
  }
  const usedAt = ctx.localCheckIn(ticket.id) ?? (ticket.status === "checked_in" ? (ticket.checkedInAt ?? "") : undefined);
  if (usedAt !== undefined) return { valid: false, reason: "ALREADY_USED", ticket, usedAt };
  return { valid: true, ticket };
}
