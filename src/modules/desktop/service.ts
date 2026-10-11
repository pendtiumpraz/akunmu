import { randomToken } from "../../shared/crypto/tokens";
import { asPlatform } from "../../shared/db";
import { updateTenant } from "../tenants/repository";
import { signUpTenant } from "../tenants/service";
import type { User } from "../users/schema";
import { findFirstWorkspaceAdmin } from "./repository";

/**
 * The desktop app keeps one workspace on the machine, with one owner made on the first launch. The shell signs the
 * owner in with a key that changes every launch, so there is no password to remember (the stored one is random).
 */

/** The address the owner starts with. It can be changed in Settings: the owner is found by role, not by address. */
export const DESKTOP_OWNER_EMAIL = "owner@akunmu.local";

export async function desktopOwner(defaults: { name: string; workspace: string }): Promise<User> {
  const existing = await asPlatform(() => findFirstWorkspaceAdmin());
  if (existing) return existing;
  const { tenant } = await signUpTenant({ workspace: defaults.workspace, name: defaults.name, email: DESKTOP_OWNER_EMAIL, password: randomToken(24) });
  await asPlatform(() => updateTenant(tenant.id, { status: "active" }));
  const owner = await asPlatform(() => findFirstWorkspaceAdmin());
  if (!owner) throw new Error("The desktop owner could not be created.");
  return owner;
}
