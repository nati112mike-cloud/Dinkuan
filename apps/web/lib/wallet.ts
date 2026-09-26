"use client";

/** Wallet cache (F6-AC4): tickets and pre-signed QR codes kept on the device for offline use. */
export interface WalletTicket {
  id: string;
  status: "valid" | "checked_in";
  holderName: string;
  typeName: string;
  checkedInAt: string | null;
  event: {
    id: string;
    slug: string;
    titleEn: string | null;
    titleAm: string | null;
    startsAt: string;
    endsAt: string | null;
    venue: string;
    posterUrl: string;
  };
  qr: { rotating: { window: number; payload: string }[] } | null;
}

export interface Wallet {
  tickets: WalletTicket[];
  fetchedAt: string;
}

const KEY = "dk_wallet";

export function readWallet(): Wallet | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Wallet) : null;
  } catch {
    return null;
  }
}

function writeWallet(w: Wallet) {
  try {
    localStorage.setItem(KEY, JSON.stringify(w));
  } catch {
    // Storage full or blocked: the wallet still works online.
  }
}

/** Fetch fresh wallet data; fall back to the cached copy when offline. */
export async function loadWallet(): Promise<{ wallet: Wallet | null; offline: boolean; unauthenticated: boolean }> {
  try {
    const res = await fetch("/api/tickets", { cache: "no-store" });
    if (res.status === 401) return { wallet: null, offline: false, unauthenticated: true };
    if (!res.ok) throw new Error(String(res.status));
    const wallet = (await res.json()).data as Wallet;
    writeWallet(wallet);
    return { wallet, offline: false, unauthenticated: false };
  } catch {
    return { wallet: readWallet(), offline: true, unauthenticated: false };
  }
}

/** The code for this 30-second window, or null when the cached codes have run out (go online once). */
export function currentQr(t: WalletTicket, now = Date.now()): { payload: string } | null {
  if (!t.qr) return null;
  const w = Math.floor(now / 1000 / 30);
  const hit = t.qr.rotating.find((r) => r.window === w);
  return hit ? { payload: hit.payload } : null;
}
