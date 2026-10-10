import { listProviders } from "@/modules/accounts/repository";
import { createDevice, createProfile } from "@/modules/devices/service";
import { deviceInputSchema, profileInputSchema } from "@/modules/devices/validation";
import { recordSignIn } from "@/modules/signins/service";
import { signInInputSchema } from "@/modules/signins/validation";
import { createStaff } from "@/modules/users/service";
import type { StaffRole } from "@/modules/users/schema";

let sequence = 0;

export async function staffUser(role: StaffRole = "admin") {
  sequence += 1;
  return createStaff(
    { name: `Staff ${sequence}`, email: `staff${sequence}@example.com`, role, password: "correct-horse-battery", locale: null },
    null,
  );
}

/** A built-in provider of the current workspace by slug ("google", "github", …). */
export async function provider(slug: string) {
  const found = (await listProviders()).find((row) => row.provider.slug === slug);
  if (!found) throw new Error(`No provider ${slug} in this workspace.`);
  return found.provider;
}

export async function device(actorId: number, overrides: Record<string, unknown> = {}) {
  sequence += 1;
  return createDevice(deviceInputSchema.parse({ name: `Laptop ${sequence}`, kind: "laptop", system: "windows", ...overrides }), actorId);
}

export async function browserProfile(deviceId: number, actorId: number, overrides: Record<string, unknown> = {}) {
  sequence += 1;
  return createProfile(deviceId, profileInputSchema.parse({ browser: "chrome", name: `Profile ${sequence}`, ...overrides }), actorId);
}

/** Records `identifier` at a provider as signed in at a place (a browser profile, or the device itself). */
export async function signIn(actorId: number, place: { deviceId: number; profileId?: number | null; app?: string | null }, account: { provider: string; identifier: string }) {
  const owner = await provider(account.provider);
  return recordSignIn(
    signInInputSchema.parse({ providerId: owner.id, identifier: account.identifier, deviceId: place.deviceId, profileId: place.profileId ?? null, app: place.app ?? null }),
    actorId,
  );
}
