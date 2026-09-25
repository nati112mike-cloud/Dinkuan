import { describe, expect, it } from "vitest";
import { messages } from "../src";

describe("i18n", () => {
  it("am and en have exactly the same keys (CLAUDE.md rule 8)", () => {
    expect(Object.keys(messages.am).sort()).toEqual(Object.keys(messages.en).sort());
  });
  it("no empty strings", () => {
    for (const lang of ["am", "en"] as const) {
      for (const [k, v] of Object.entries(messages[lang])) expect(v, `${lang}:${k}`).not.toBe("");
    }
  });
});
