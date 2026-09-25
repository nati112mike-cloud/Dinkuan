/** Stable error codes shared by API, UI (translated) and tests. */
export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "INVALID_PHONE"
  | "OTP_RATE_LIMITED"
  | "OTP_INVALID"
  | "OTP_EXPIRED"
  | "OTP_TOO_MANY_ATTEMPTS"
  | "SOLD_OUT"
  | "SALES_CLOSED"
  | "PER_ORDER_MAX"
  | "PER_PHONE_MAX"
  | "TOO_MANY_PENDING_ORDERS"
  | "EVENT_NOT_ON_SALE"
  | "RESERVATION_EXPIRED"
  | "PAYMENT_UNVERIFIED"
  | "WEBHOOK_SIGNATURE"
  | "USERNAME_INVALID"
  | "USERNAME_TAKEN"
  | "BLOCKED"
  | "EDIT_WINDOW_CLOSED"
  | "RATE_LIMITED"
  | "UPLOAD_TOO_LARGE"
  | "UPLOAD_TYPE"
  | "UPLOAD_INCOMPLETE";

export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "DomainError";
  }
}
