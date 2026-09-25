import { describe, expect, it } from "vitest";
import { generateSigningKeyPair, qrWindow, scanTicket, signQr, verifyQr, type PackTicket } from "../src";

describe("QR signing (F6-AC2/AC3)", () => {
  it("verifies a valid rotating QR and rejects tampering", async () => {
    const { privateKey, publicKey } = await generateSigningKeyPair();
    const now = new Date();
    const payload = await signQr({ ticketId: "t1", eventId: "e1", version: 1, window: qrWindow(now) }, privateKey);
    expect((await verifyQr(payload, { eventId: "e1", publicKey, now })).ok).toBe(true);
    const tampered = payload.replace("t1.e1.1.", "t2.e1.1.");
    expect(await verifyQr(tampered, { eventId: "e1", publicKey, now })).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
  });

  it("rejects a QR signed by another event's key (fake)", async () => {
    const a = await generateSigningKeyPair();
    const b = await generateSigningKeyPair();
    const payload = await signQr({ ticketId: "t1", eventId: "e1", version: 1, window: 0 }, a.privateKey);
    const res = await verifyQr(payload, { eventId: "e1", publicKey: b.publicKey, now: new Date() });
    expect(res).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
  });

  it("F6-AC3: a rotating QR expires after its window; the static fallback does not", async () => {
    const { privateKey, publicKey } = await generateSigningKeyPair();
    const then = new Date("2026-01-01T12:00:00Z");
    const later = new Date(then.getTime() + 5 * 60_000);
    const rotating = await signQr({ ticketId: "t", eventId: "e", version: 1, window: qrWindow(then) }, privateKey);
    const fallback = await signQr({ ticketId: "t", eventId: "e", version: 1, window: 0 }, privateKey);
    expect(await verifyQr(rotating, { eventId: "e", publicKey, now: later })).toEqual({ ok: false, reason: "EXPIRED_QR" });
    expect((await verifyQr(fallback, { eventId: "e", publicKey, now: later })).ok).toBe(true);
  });

  it("rejects malformed and wrong-event payloads", async () => {
    const { privateKey, publicKey } = await generateSigningKeyPair();
    expect((await verifyQr("hello", { eventId: "e", publicKey, now: new Date() })).ok).toBe(false);
    const payload = await signQr({ ticketId: "t", eventId: "other", version: 1, window: 0 }, privateKey);
    expect(await verifyQr(payload, { eventId: "e", publicKey, now: new Date() })).toEqual({
      ok: false,
      reason: "WRONG_EVENT",
    });
  });
});

describe("F8-AC2: local gate verification", () => {
  it("checks version, status and prior check-in", async () => {
    const { privateKey, publicKey } = await generateSigningKeyPair();
    const now = new Date();
    const tickets = new Map<string, PackTicket>([
      ["ok", { id: "ok", version: 1, status: "valid", typeName: "VIP", holderName: "Abebe" }],
      ["moved", { id: "moved", version: 2, status: "valid", typeName: "VIP", holderName: "Sara" }],
      ["ref", { id: "ref", version: 1, status: "refunded", typeName: "VIP", holderName: "Kebede" }],
    ]);
    const used = new Map<string, string>();
    const ctx = {
      eventId: "e",
      publicKey,
      now,
      findTicket: (id: string) => tickets.get(id),
      localCheckIn: (id: string) => used.get(id),
    };
    const qr = (id: string, version = 1) => signQr({ ticketId: id, eventId: "e", version, window: 0 }, privateKey);

    expect(await scanTicket(await qr("ok"), ctx)).toMatchObject({ valid: true });
    used.set("ok", now.toISOString());
    expect(await scanTicket(await qr("ok"), ctx)).toMatchObject({ valid: false, reason: "ALREADY_USED" });
    // Old QR after transfer (version bumped to 2) is rejected
    expect(await scanTicket(await qr("moved", 1), ctx)).toMatchObject({ valid: false, reason: "OLD_VERSION" });
    expect(await scanTicket(await qr("moved", 2), ctx)).toMatchObject({ valid: true });
    expect(await scanTicket(await qr("ref"), ctx)).toMatchObject({ valid: false, reason: "REFUNDED" });
    expect(await scanTicket(await qr("ghost"), ctx)).toMatchObject({ valid: false, reason: "UNKNOWN_TICKET" });
  });
});
