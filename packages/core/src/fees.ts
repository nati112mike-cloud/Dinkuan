import { applyBps, type Santim } from "./money";

/** PRD F5-AC2: buyer pays 5% of ticket price + 10 ETB per paid ticket. Free tickets have no fee. */
export const DEFAULT_FEE_PCT_BPS = 500;
export const DEFAULT_FEE_FIXED_SANTIM = 1000;

export interface FeeConfig {
  feePctBps: number;
  feeFixedSantim: Santim;
}

export function feePerTicket(price: Santim, cfg: FeeConfig): Santim {
  if (price === 0) return 0;
  return applyBps(price, cfg.feePctBps) + cfg.feeFixedSantim;
}

/** All-in price shown on the event page (F4-AC4). */
export function allInPrice(price: Santim, cfg: FeeConfig): Santim {
  return price + feePerTicket(price, cfg);
}

export interface PriceLine {
  unitPrice: Santim;
  qty: number;
}

export interface OrderTotals {
  subtotal: Santim;
  fee: Santim;
  total: Santim;
}

export function orderTotals(lines: PriceLine[], cfg: FeeConfig): OrderTotals {
  let subtotal = 0;
  let fee = 0;
  for (const l of lines) {
    if (!Number.isInteger(l.qty) || l.qty < 0) throw new Error(`Invalid qty: ${l.qty}`);
    subtotal += l.unitPrice * l.qty;
    fee += feePerTicket(l.unitPrice, cfg) * l.qty;
  }
  return { subtotal, fee, total: subtotal + fee };
}
