import { prisma } from "@dinkuan/db";
import { beforeEach, describe, expect, it } from "vitest";
import { DEMO_OTP, requestOtp, userForSession, verifyOtp, logout } from "../src/server";
import { resetDb } from "./helpers";

beforeEach(resetDb);

describe("F1 auth", () => {
  it("F1-AC1: normalises the phone number", async () => {
    expect((await requestOtp("0911 22 33 44")).phone).toBe("+251911223344");
    await expect(requestOtp("12345")).rejects.toMatchObject({ code: "INVALID_PHONE" });
  });

  it("F1-AC2: max 3 sends per 15 minutes per number", async () => {
    const t0 = new Date();
    await requestOtp("0911000001", t0);
    await requestOtp("0911000001", t0);
    await requestOtp("0911000001", t0);
    await expect(requestOtp("0911000001", t0)).rejects.toMatchObject({ code: "OTP_RATE_LIMITED" });
    await expect(requestOtp("0911000001", new Date(t0.getTime() + 16 * 60_000))).resolves.toBeTruthy();
  });

  it("F1-AC2: code expires after 5 minutes", async () => {
    const t0 = new Date();
    await requestOtp("0911000002", t0);
    await expect(verifyOtp("0911000002", DEMO_OTP, new Date(t0.getTime() + 6 * 60_000))).rejects.toMatchObject({
      code: "OTP_EXPIRED",
    });
  });

  it("F1-AC2: max 5 attempts", async () => {
    await requestOtp("0911000003");
    for (let i = 0; i < 5; i++) await expect(verifyOtp("0911000003", "000000")).rejects.toMatchObject({ code: "OTP_INVALID" });
    await expect(verifyOtp("0911000003", DEMO_OTP)).rejects.toMatchObject({ code: "OTP_TOO_MANY_ATTEMPTS" });
  });

  it("F1-AC3: session lasts 30 days and logout clears it", async () => {
    await requestOtp("+251711000004");
    const { token, user, isNew } = await verifyOtp("0711000004", DEMO_OTP);
    expect(isNew).toBe(true);
    expect(user.phone).toBe("+251711000004");
    expect((await userForSession(token))?.id).toBe(user.id);
    expect(await userForSession(token, new Date(Date.now() + 31 * 86400_000))).toBeNull();
    await logout(token);
    expect(await userForSession(token)).toBeNull();
  });

  it("the OTP is stored hashed, never in plain text", async () => {
    await requestOtp("0911000005");
    const row = await prisma.otpCode.findUniqueOrThrow({ where: { phone: "+251911000005" } });
    expect(row.codeHash).not.toContain(DEMO_OTP);
  });
});
