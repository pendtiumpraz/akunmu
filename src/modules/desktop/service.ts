import { randomToken } from "../../shared/crypto/tokens";
import { asPlatform } from "../../shared/db";
import { updateTenant } from "../tenants/repository";
import { signUpTenant } from "../tenants/service";
import type { User } from "../users/schema";
import { createStaff } from "../users/service";
import { findFirstPlatformAdmin, findFirstWorkspaceAdmin } from "./repository";

/**
 * The desktop app starts empty, with two people made on the first launch: the default user (admin of the one
 * workspace) and the default superadmin (the platform console). Nobody signs in: the shell opens the app with a key
 * made for each launch, and the app switches between the two (its modes) by itself. Their stored passwords are random.
 */

export const DESKTOP_MODES = ["user", "superadmin"] as const;
export type DesktopMode = (typeof DESKTOP_MODES)[number];

/** The addresses they start with. Both can be changed: each is found by role, not by address. */
export const DESKTOP_USER_EMAIL = "user@akunmu.local";
export const DESKTOP_SUPERADMIN_EMAIL = "superadmin@akunmu.local";

export type DesktopDefaults = { userName: string; superadminName: string; workspace: string };

async function desktopUser(defaults: DesktopDefaults): Promise<User> {
  const existing = await asPlatform(() => findFirstWorkspaceAdmin());
  if (existing) return existing;
  const { tenant } = await signUpTenant({ workspace: defaults.workspace, name: defaults.userName, email: DESKTOP_USER_EMAIL, password: randomToken(24) });
  await asPlatform(() => updateTenant(tenant.id, { status: "active" }));
  const user = await asPlatform(() => findFirstWorkspaceAdmin());
  if (!user) throw new Error("The desktop user could not be created.");
  return user;
}

async function desktopSuperadmin(defaults: DesktopDefaults): Promise<User> {
  const existing = await asPlatform(() => findFirstPlatformAdmin());
  if (existing) return existing;
  await asPlatform(() => createStaff({ name: defaults.superadminName, email: DESKTOP_SUPERADMIN_EMAIL, role: "admin", password: randomToken(24), locale: null }, null));
  const superadmin = await asPlatform(() => findFirstPlatformAdmin());
  if (!superadmin) throw new Error("The desktop superadmin could not be created.");
  return superadmin;
}

/** Both people, made on the first launch. */
export async function desktopPeople(defaults: DesktopDefaults): Promise<Record<DesktopMode, User>> {
  const user = await desktopUser(defaults);
  const superadmin = await desktopSuperadmin(defaults);
  return { user, superadmin };
}

/** Where each mode opens. */
export function desktopHome(mode: DesktopMode): string {
  return mode === "superadmin" ? "/platform" : "/app";
}
