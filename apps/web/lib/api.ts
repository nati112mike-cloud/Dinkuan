import "server-only";
import { NextResponse } from "next/server";
import { DomainError, type ErrorCode } from "@dinkuan/core";
import { WebhookSignatureError } from "@dinkuan/payments";
import { z } from "zod";

/** API convention (CLAUDE.md): `{ data }` or `{ error: { code, message } }`. */
export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

const STATUS: Partial<Record<ErrorCode, number>> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  OTP_RATE_LIMITED: 429,
  WEBHOOK_SIGNATURE: 401,
  BLOCKED: 403,
  RATE_LIMITED: 429,
  UPLOAD_TOO_LARGE: 413,
  DATE_UNAVAILABLE: 409,
  CAMPAIGN_STATE: 409,
  REFUND_FAILED: 502,
};

export function fail(code: ErrorCode, message?: string) {
  return NextResponse.json({ error: { code, message: message ?? code } }, { status: STATUS[code] ?? 400 });
}

export function handleError(e: unknown) {
  if (e instanceof DomainError) return fail(e.code, e.message);
  if (e instanceof z.ZodError) return fail("VALIDATION", e.issues.map((i) => i.message).join("; "));
  if (e instanceof WebhookSignatureError) return fail("WEBHOOK_SIGNATURE");
  console.error(e);
  return NextResponse.json({ error: { code: "INTERNAL", message: "Internal error" } }, { status: 500 });
}

export async function parseJson<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  const body = await req.json().catch(() => {
    throw new DomainError("VALIDATION", "Body must be JSON");
  });
  return schema.parse(body);
}
