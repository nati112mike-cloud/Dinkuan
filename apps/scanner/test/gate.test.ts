import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { generateSigningKeyPair, signQr, toBase64Url } from "@dinkuan/core";
import { ScannerDb } from "../src/db";
import { counts, manualAdmit, verifyAtGate } from "../src/gate";

let store: ScannerDb;
let privateKey: Uint8Array;

beforeEach(async () => {
  store = new ScannerDb(`test-${Math.random()}`);
  const keys = await generateSigningKeyPair();
  privateKey = keys.privateKey;
  await store.packs.put({ eventId: "e1", title: "Night", titleAm: null, startsAt: new Date().toISOString(), venue: "Hall", publicKey: toBase64Url(keys.publicKey), generatedAt: "" });
  await store.tickets.bulkPut(
    Array.from({ length: 200 }, (_, i) => ({
      id: `t${i}`,
      eventId: "e1",
      version: 1,
      status: i === 199 ? ("refunded" as const) : ("valid" as const),
      typeName: "Regular",
      holderName: `Guest ${i}`,
      phoneLast4: String(1000 + i),
      gate: null,
      checkedInAt: null,
    })),
  );
});

const qr = (id: string) => signQr({ ticketId: id, eventId: "e1", version: 1, window: 0 }, privateKey);

describe("F8 scanner, fully offline", () => {
  it("F8-AC2/AC3: 199 valid scans admit, repeats are rejected, a refunded ticket is rejected, in under 1 s each", async () => {
    for (let i = 0; i < 199; i++) {
      const started = performance.now();
      const r = await verifyAtGate(await qr(`t${i}`), { eventId: "e1", gate: "A", store });
      expect(r.valid).toBe(true);
      expect(performance.now() - started).toBeLessThan(1000);
    }
    expect(await verifyAtGate(await qr("t5"), { eventId: "e1", gate: "A", store })).toMatchObject({ valid: false, reason: "ALREADY_USED" });
    expect(await verifyAtGate(await qr("t199"), { eventId: "e1", gate: "A", store })).toMatchObject({ valid: false, reason: "REFUNDED" });
    expect(await counts("e1", store)).toEqual({ checkedIn: 199, total: 199, pending: 199 });
  });

  it("F8-AC5: manual admit follows the same rules", async () => {
    expect((await manualAdmit("e1", "t1", "A", store)).ok).toBe(true);
    expect(await manualAdmit("e1", "t1", "A", store)).toMatchObject({ ok: false, reason: "ALREADY_USED" });
  });
});
