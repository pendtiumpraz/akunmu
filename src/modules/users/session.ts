import { cookies } from "next/headers";
import { randomToken, sha256Hex } from "../../shared/crypto/tokens";
import { asPlatform } from "../../shared/db";
import { isProduction } from "../../shared/env";
import { forbidden, unauthorized } from "../../shared/http/errors";
import { isServing, tenantById } from "../tenants/service";
import { can, type Permission } from "./permissions";
import { findValidSession, insertSession, revokeSessionByHash, touchSession } from "./repository";
import type { User } from "./schema";

/**
 * Staff sessions: random token in an httpOnly cookie, only its SHA-256 hash is stored.
 * Sessions are looked up in the platform scope (the tenant is not known until the user is);
 * a user of a suspended or deleted tenant has no valid session.
 */
export const STAFF_COOKIE = "pe_staff";
const SESSION_DAYS = 7;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/** `tenantId` is null for platform staff (AkunMu owner console). */
export type StaffContext = { user: User; sessionId: number; tenantId: number | null };

export async function startStaffSession(user: User, userAgent: string | null): Promise<void> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await asPlatform(() => insertSession({ userId: user.id, tokenHash: sha256Hex(token), expiresAt, userAgent: userAgent?.slice(0, 300) ?? null }));
  const cookieStore = await cookies();
  cookieStore.set(STAFF_COOKIE, token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function readStaffSession(): Promise<StaffContext | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(STAFF_COOKIE)?.value;
  if (!token) return null;
  const found = await asPlatform(() => findValidSession(sha256Hex(token)));
  if (!found) return null;
  if (found.user.tenantId !== null && !isServing(await tenantById(found.user.tenantId))) return null;
  const lastUsed = found.session.lastUsedAt?.getTime() ?? 0;
  if (Date.now() - lastUsed > TOUCH_INTERVAL_MS) await asPlatform(() => touchSession(found.session.id));
  return { user: found.user, sessionId: found.session.id, tenantId: found.user.tenantId };
}

export async function endStaffSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(STAFF_COOKIE)?.value;
  if (token) await asPlatform(() => revokeSessionByHash(sha256Hex(token)));
  cookieStore.delete(STAFF_COOKIE);
}

/** Throws 401 without a session and 403 when the role lacks the permission. */
export async function requireStaff(permission?: Permission): Promise<StaffContext> {
  const staff = await readStaffSession();
  if (!staff) throw unauthorized();
  if (permission && !can(staff.user.role, permission)) throw forbidden();
  return staff;
}
