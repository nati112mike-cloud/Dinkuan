import Dexie, { type Table } from "dexie";
import type { PackTicket } from "@dinkuan/core";

/** Everything the gate needs lives in IndexedDB so a whole event can run with no internet (F8). */
export interface StoredPack {
  eventId: string;
  title: string;
  titleAm: string | null;
  startsAt: string;
  venue: string;
  publicKey: string;
  generatedAt: string;
}

export interface StoredTicket extends PackTicket {
  eventId: string;
  phoneLast4: string;
  gate: string | null;
}

export interface QueuedCheckIn {
  id?: number;
  eventId: string;
  ticketId: string;
  scannedAt: string;
  gate: string;
  synced: 0 | 1;
  result?: string;
}

export class ScannerDb extends Dexie {
  packs!: Table<StoredPack, string>;
  tickets!: Table<StoredTicket, string>;
  checkIns!: Table<QueuedCheckIn, number>;

  constructor(name = "dinkuan-scanner") {
    super(name);
    this.version(1).stores({
      packs: "eventId",
      tickets: "id, eventId, [eventId+status]",
      checkIns: "++id, eventId, ticketId, synced, [eventId+synced]",
    });
  }
}

export const db = new ScannerDb();
