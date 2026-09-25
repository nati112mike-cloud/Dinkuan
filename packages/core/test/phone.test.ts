import { describe, expect, it } from "vitest";
import { normalizeEthiopianPhone } from "../src";

describe("F1-AC1: phone normalisation", () => {
  it.each([
    ["0911223344", "+251911223344"],
    ["0711223344", "+251711223344"],
    ["+251911223344", "+251911223344"],
    ["+251711223344", "+251711223344"],
    ["251911223344", "+251911223344"],
    ["091 122 3344", "+251911223344"],
  ])("%s -> %s", (input, out) => {
    expect(normalizeEthiopianPhone(input)).toBe(out);
  });
  it.each(["0811223344", "091122334", "+1911223344", "hello"])("rejects %s", (input) => {
    expect(normalizeEthiopianPhone(input)).toBeNull();
  });
});
