/** Sign-in types shared by the server and the browser (no database imports). */

export const SIGN_IN_STATUSES = ["signed_in", "signed_out"] as const;
export type SignInStatus = (typeof SIGN_IN_STATUSES)[number];

/** A sign-in not confirmed for this many days is shown as "to check". */
export const STALE_AFTER_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Sign-ins not confirmed since this instant count as "to check". */
export function staleBefore(now = new Date()): Date {
  return new Date(now.getTime() - STALE_AFTER_DAYS * DAY_MS);
}
