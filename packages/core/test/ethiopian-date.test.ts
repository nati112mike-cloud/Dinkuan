import { describe, expect, it } from "vitest";
import { ethiopianToGregorian, formatEthiopianDate, gregorianToEthiopian } from "../src";

describe("Ethiopian calendar", () => {
  it("Enkutatash (new year) 2016 E.C. is 12 Sep 2023", () => {
    expect(gregorianToEthiopian(2023, 9, 12)).toEqual({ year: 2016, month: 1, day: 1 });
  });
  it("Pagume 6 exists in leap year 2015 E.C. (11 Sep 2023)", () => {
    expect(gregorianToEthiopian(2023, 9, 11)).toEqual({ year: 2015, month: 13, day: 6 });
  });
  it("Enkutatash 2017 E.C. is 11 Sep 2024", () => {
    expect(gregorianToEthiopian(2024, 9, 11)).toEqual({ year: 2017, month: 1, day: 1 });
  });
  it("Genna 2016 E.C. (Tahsas 28) is 7 Jan 2024", () => {
    expect(gregorianToEthiopian(2024, 1, 7)).toEqual({ year: 2016, month: 4, day: 28 });
  });
  it("round-trips every day for 10 years", () => {
    const start = Date.UTC(2020, 0, 1);
    for (let d = 0; d < 3653; d++) {
      const date = new Date(start + d * 86400_000);
      const g = { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
      expect(ethiopianToGregorian(gregorianToEthiopian(g.year, g.month, g.day))).toEqual(g);
    }
  });
  it("formats in Amharic and English using Addis time", () => {
    // 22:00 UTC on 11 Sep 2024 is already 12 Sep 01:00 in Addis -> Meskerem 2
    const instant = new Date(Date.UTC(2024, 8, 11, 22, 0));
    expect(formatEthiopianDate(instant, "en")).toBe("Meskerem 2, 2017 E.C.");
    expect(formatEthiopianDate(instant, "am")).toBe("መስከረም 2፣ 2017 ዓ.ም.");
  });
});
