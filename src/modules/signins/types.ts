/** Sign-in types shared by the server and the browser (no database imports). */

export const SIGN_IN_STATUSES = ["signed_in", "signed_out"] as const;
export type SignInStatus = (typeof SIGN_IN_STATUSES)[number];

/**
 * How a sign-in was let in from a place where the account was already signed in: a code shown on one side and typed
 * on the other (device login of CLIs and TVs), a magic link opened there, a QR code scanned there, or a prompt
 * accepted there ("Is it you?").
 */
export const APPROVAL_METHODS = ["code", "link", "qr", "prompt"] as const;
export type ApprovalMethod = (typeof APPROVAL_METHODS)[number];

/** What an app sign-in on the device is: an app (desktop or phone) or a command-line tool. */
export const APP_KINDS = ["app", "cli"] as const;
export type AppKind = (typeof APP_KINDS)[number];

/** A sign-in not confirmed for this many days is shown as "to check". */
export const STALE_AFTER_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Sign-ins not confirmed since this instant count as "to check". */
export function staleBefore(now = new Date()): Date {
  return new Date(now.getTime() - STALE_AFTER_DAYS * DAY_MS);
}
