import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { accountDetail, createProvider, deleteAccount, deleteProvider, findOrCreateAccount, listProvidersView, restoreAccount, restoreProvider } from "@/modules/accounts/service";
import { providerInputSchema } from "@/modules/accounts/validation";
import { deleteDevice, deleteProfile, deviceDetail, listDevicesView, markDeviceChecked, restoreDevice } from "@/modules/devices/service";
import { deviceInputSchema } from "@/modules/devices/validation";
import { signIns } from "@/modules/signins/schema";
import { confirmSignIn, mapView, overview, recordSignIn, signOut, updateSignIn } from "@/modules/signins/service";
import { signInInputSchema } from "@/modules/signins/validation";
import { parseWith } from "@/shared/http/validation";
import { openTestDatabase, type TestDatabase } from "../helpers/database";
import { browserProfile, device, provider, signIn, staffUser } from "../helpers/fixtures";

let database: TestDatabase;

beforeEach(async () => {
  database = await openTestDatabase();
});

afterEach(async () => {
  await database.close();
});

describe("recording sign-ins", () => {
  it("adds the account on its first sign-in and reuses it after that, whatever the letter case", async () => {
    const admin = await staffUser();
    const laptop = await device(admin.id);
    const work = await browserProfile(laptop.id, admin.id, { name: "Work" });
    const personal = await browserProfile(laptop.id, admin.id, { name: "Personal" });

    const first = await signIn(admin.id, { deviceId: laptop.id, profileId: work.id }, { provider: "google", identifier: "Galih@Example.com" });
    const second = await signIn(admin.id, { deviceId: laptop.id, profileId: personal.id }, { provider: "google", identifier: "galih@example.com" });

    expect(first.accountCreated).toBe(true);
    expect(second.accountCreated).toBe(false);
    expect(second.account.id).toBe(first.account.id);
    expect(second.profile).toMatchObject({ id: personal.id, name: "Personal", browser: "chrome" });
    const account = await accountDetail(first.account.id);
    expect(account.signIns.map((row) => row.profile?.name).sort()).toEqual(["Personal", "Work"]);
  });

  it("keeps one active sign-in per account and place, and keeps signed-out ones as history", async () => {
    const admin = await staffUser();
    const laptop = await device(admin.id);
    const row = await signIn(admin.id, { deviceId: laptop.id, app: "Windows" }, { provider: "microsoft", identifier: "me@outlook.com" });

    await expect(signIn(admin.id, { deviceId: laptop.id, app: "windows" }, { provider: "microsoft", identifier: "me@outlook.com" })).rejects.toMatchObject({
      status: 409,
      messageKey: "errors.alreadySignedIn",
    });

    const ended = await signOut(row.id, admin.id);
    expect(ended).toMatchObject({ status: "signed_out" });
    expect(ended.signedOutAt).not.toBeNull();
    const again = await signIn(admin.id, { deviceId: laptop.id, app: "Windows" }, { provider: "microsoft", identifier: "me@outlook.com" });
    expect(again.id).not.toBe(row.id);
    expect((await accountDetail(row.account.id)).signIns.map((item) => item.status).sort()).toEqual(["signed_in", "signed_out"]);
    expect((await mapView()).signIns.map((item) => item.id)).toEqual([again.id]);
  });

  it("refuses a browser profile of another device, and an app name together with a profile", async () => {
    const admin = await staffUser();
    const laptop = await device(admin.id);
    const phone = await device(admin.id, { kind: "phone", system: "android" });
    const laptopProfile = await browserProfile(laptop.id, admin.id);
    const google = await provider("google");

    await expect(signIn(admin.id, { deviceId: phone.id, profileId: laptopProfile.id }, { provider: "google", identifier: "a@example.com" })).rejects.toMatchObject({
      issues: [{ path: "profileId", messageKey: "validation.profileOfDevice" }],
    });
    expect(() =>
      parseWith(signInInputSchema, { providerId: google.id, identifier: "a@example.com", deviceId: laptop.id, profileId: laptopProfile.id, app: "Gmail" }),
    ).toThrow();
    expect(() => parseWith(signInInputSchema, { deviceId: laptop.id })).toThrow();
  });

  it("refuses notes that look like a secret", async () => {
    const admin = await staffUser();
    const laptop = await device(admin.id);
    const google = await provider("google");
    const base = { providerId: google.id, identifier: "a@example.com", deviceId: laptop.id };
    for (const notes of ["key sk-abcdefghijklmnop1234567890", "codes 1234-5678 9012-3456 7890-1234", "ghp_abcdefghijklmnopqrstuvwxyz123456"]) {
      expect(() => parseWith(signInInputSchema, { ...base, notes })).toThrow();
    }
    const row = await recordSignIn(parseWith(signInInputSchema, { ...base, notes: "Signed in for the October audit" }), admin.id);
    expect(row.notes).toBe("Signed in for the October audit");
    expect(() => parseWith(deviceInputSchema, { name: "Laptop", notes: "-----BEGIN RSA PRIVATE KEY-----" })).toThrow();
  });
});

describe("checking sign-ins", () => {
  it("counts stale and marked sign-ins, and confirming clears them", async () => {
    const admin = await staffUser();
    const laptop = await device(admin.id);
    const old = await signIn(admin.id, { deviceId: laptop.id }, { provider: "google", identifier: "old@example.com" });
    const marked = await signIn(admin.id, { deviceId: laptop.id }, { provider: "github", identifier: "octo" });
    await signIn(admin.id, { deviceId: laptop.id }, { provider: "slack", identifier: "fresh@example.com" });
    await database.db.update(signIns).set({ lastVerifiedAt: new Date(Date.now() - 45 * 86_400_000) }).where(eq(signIns.id, old.id));
    await updateSignIn(marked.id, { review: true }, admin.id);

    const before = await overview();
    expect(before.totals).toMatchObject({ signIns: 3, stale: 1, review: 1, devices: 1, accounts: 3 });
    expect(before.staleSignIns.map((row) => row.id)).toEqual([old.id]);

    await confirmSignIn(old.id, admin.id);
    await confirmSignIn(marked.id, admin.id);
    expect((await overview()).totals).toMatchObject({ stale: 0, review: 0 });
  });

  it("confirms everything on a device at once and remembers when it was checked", async () => {
    const admin = await staffUser();
    const laptop = await device(admin.id);
    const row = await signIn(admin.id, { deviceId: laptop.id }, { provider: "google", identifier: "a@example.com" });
    await updateSignIn(row.id, { review: true }, admin.id);

    const checked = await markDeviceChecked(laptop.id, admin.id);
    expect(checked.confirmed).toBe(1);
    expect(checked.lastCheckedAt).not.toBeNull();
    expect((await mapView()).signIns[0].review).toBe(false);
  });

  it("refuses to confirm a sign-in that has ended", async () => {
    const admin = await staffUser();
    const laptop = await device(admin.id);
    const row = await signIn(admin.id, { deviceId: laptop.id }, { provider: "google", identifier: "a@example.com" });
    await signOut(row.id, admin.id);
    await expect(confirmSignIn(row.id, admin.id)).rejects.toMatchObject({ status: 409, messageKey: "errors.signInEnded" });
  });

  it("lists the accounts signed in on the most places first", async () => {
    const admin = await staffUser();
    const laptop = await device(admin.id);
    const phone = await device(admin.id, { kind: "phone" });
    await signIn(admin.id, { deviceId: laptop.id }, { provider: "google", identifier: "everywhere@example.com" });
    await signIn(admin.id, { deviceId: phone.id }, { provider: "google", identifier: "everywhere@example.com" });
    await signIn(admin.id, { deviceId: phone.id }, { provider: "github", identifier: "once" });
    const { busiestAccounts } = await overview();
    expect(busiestAccounts.map((account) => [account.identifier, account.places])).toEqual([
      ["everywhere@example.com", 2],
      ["once", 1],
    ]);
  });
});

describe("trash and restore", () => {
  it("trashes a device with its profiles and sign-ins, and restores them together", async () => {
    const admin = await staffUser();
    const laptop = await device(admin.id);
    const work = await browserProfile(laptop.id, admin.id);
    await signIn(admin.id, { deviceId: laptop.id, profileId: work.id }, { provider: "google", identifier: "a@example.com" });
    await signIn(admin.id, { deviceId: laptop.id, app: "Windows" }, { provider: "microsoft", identifier: "b@outlook.com" });

    await deleteDevice(laptop.id, admin.id);
    expect(await listDevicesView()).toHaveLength(0);
    expect((await mapView()).signIns).toHaveLength(0);
    expect((await overview()).totals.signIns).toBe(0);

    await restoreDevice(laptop.id, admin.id);
    const restored = await deviceDetail(laptop.id);
    expect(restored.profiles.map((profile) => profile.id)).toEqual([work.id]);
    expect(restored.profiles[0].signIns).toHaveLength(1);
    expect(restored.onDevice).toHaveLength(1);
  });

  it("trashes an account with its sign-ins, restores them, and refuses a restore over a newer account", async () => {
    const admin = await staffUser();
    const laptop = await device(admin.id);
    const row = await signIn(admin.id, { deviceId: laptop.id }, { provider: "google", identifier: "a@example.com" });

    await deleteAccount(row.account.id, admin.id);
    expect((await mapView()).signIns).toHaveLength(0);
    await restoreAccount(row.account.id, admin.id);
    expect((await accountDetail(row.account.id)).signIns).toHaveLength(1);

    await deleteAccount(row.account.id, admin.id);
    const google = await provider("google");
    await findOrCreateAccount(google.id, "A@example.com", admin.id);
    await expect(restoreAccount(row.account.id, admin.id)).rejects.toMatchObject({ issues: [{ path: "identifier", messageKey: "validation.accountExists" }] });
  });

  it("removes a browser profile together with its sign-ins", async () => {
    const admin = await staffUser();
    const laptop = await device(admin.id);
    const work = await browserProfile(laptop.id, admin.id);
    await signIn(admin.id, { deviceId: laptop.id, profileId: work.id }, { provider: "google", identifier: "a@example.com" });
    await deleteProfile(work.id, admin.id);
    const detail = await deviceDetail(laptop.id);
    expect(detail.profiles).toHaveLength(0);
    expect((await mapView()).signIns).toHaveLength(0);
  });

  it("deletes only providers without accounts, and restores them", async () => {
    const admin = await staffUser();
    const laptop = await device(admin.id);
    await signIn(admin.id, { deviceId: laptop.id }, { provider: "github", identifier: "octo" });
    const github = await provider("github");
    await expect(deleteProvider(github.id, admin.id)).rejects.toMatchObject({ status: 409, messageKey: "errors.providerInUse" });

    const bank = await createProvider(parseWith(providerInputSchema, { name: "Bank Jago", domain: "jago.com", color: "#FFB400" }), admin.id);
    expect(bank.slug).toBe("bank-jago");
    await deleteProvider(bank.id, admin.id);
    expect((await listProvidersView()).some((item) => item.id === bank.id)).toBe(false);
    await restoreProvider(bank.id, admin.id);
    expect((await listProvidersView()).some((item) => item.id === bank.id)).toBe(true);
  });
});
