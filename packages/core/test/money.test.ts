import { describe, expect, it } from "vitest";
import { allInPrice, applyBps, feePerTicket, formatBirr, orderTotals, parseBirr } from "../src";

const cfg = { feePctBps: 500, feeFixedSantim: 1000 };

describe("money", () => {
  it("parses Birr strings into integer santim without floats", () => {
    expect(parseBirr("150.50")).toBe(15050);
    expect(parseBirr("1,500")).toBe(150000);
    expect(parseBirr("0.1")).toBe(10);
    expect(() => parseBirr("1.005")).toThrow();
    expect(() => parseBirr("abc")).toThrow();
  });
  it("formats santim as Birr", () => {
    expect(formatBirr(15050)).toBe("150.50");
    expect(formatBirr(150000)).toBe("1,500");
    expect(formatBirr(5)).toBe("0.05");
  });
  it("rounds basis points half up", () => {
    expect(applyBps(1010, 500)).toBe(51); // 50.5 -> 51
    expect(applyBps(1009, 500)).toBe(50); // 50.45 -> 50
  });
  it("rejects non-integer amounts", () => {
    expect(() => formatBirr(1.5)).toThrow();
  });
});

describe("fees", () => {
  it("F5-AC2: fee is 5% + 10 ETB per paid ticket", () => {
    expect(feePerTicket(50000, cfg)).toBe(2500 + 1000);
    expect(allInPrice(50000, cfg)).toBe(53500);
  });
  it("F5-AC2: free tickets have no fee", () => {
    expect(feePerTicket(0, cfg)).toBe(0);
  });
  it("totals an order", () => {
    expect(orderTotals([{ unitPrice: 50000, qty: 2 }, { unitPrice: 0, qty: 1 }], cfg)).toEqual({
      subtotal: 100000,
      fee: 7000,
      total: 107000,
    });
  });
});
