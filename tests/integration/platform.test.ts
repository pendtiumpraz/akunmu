import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listProvidersView } from "@/modules/accounts/service";
import { listDevicesView } from "@/modules/devices/service";
import {
  createTenantFromPlatform,
  deleteTenant,
  listTenantsForPlatform,
  restoreTenant,
  signUpTenant,
  tenantStatusCounts,
  updateTenant,
} from "@/modules/tenants/service";
import { BUILT_IN_PROVIDERS } from "@/modules/accounts/types";
import { insertSession } from "@/modules/users/repository";
import { authenticateStaff, createStaff, listStaff } from "@/modules/users/service";
import { staffSessions } from "@/modules/users/schema";
import { asPlatform, inTenant } from "@/shared/db";
import { openTestDatabase, type TestDatabase } from "../helpers/database";
import { device, staffUser } from "../helpers/fixtures";

let database: TestDatabase;

beforeEach(async () => {
  database = await openTestDatabase();
});

afterEach(async () => {
  await database.close();
});

const page = { page: 1, perPage: 20 };
const signup = { workspace: "Galih Devices", name: "Galih", email: "galih@example.com", password: "a-long-password" };

describe("workspace sign-up", () => {
  it("creates a trial workspace with the built-in providers and its first admin, who can sign in", async () => {
    const { tenant, admin } = await signUpTenant(signup);
    expect(tenant).toMatchObject({ slug: "galih-devices", name: "Galih Devices", status: "trial" });
    expect(admin.tenantId).toBe(tenant.id);
    expect((await authenticateStaff("galih@example.com", "a-long-password")).tenantId).toBe(tenant.id);
    expect(await inTenant(tenant.id, () => listProvidersView())).toHaveLength(BUILT_IN_PROVIDERS.length);
    // The new workspace starts empty: the test workspace's devices are not visible to it.
    const owner = await staffUser();
    await device(owner.id);
    expect(await inTenant(tenant.id, () => listDevicesView())).toHaveLength(0);
  });

  it("gives the second workspace with the same name its own address", async () => {
    await signUpTenant(signup);
    const { tenant } = await signUpTenant({ ...signup, email: "other@example.com" });
    expect(tenant.slug).toBe("galih-devices-2");
  });

  it("refuses an email that is already taken, without leaving an empty workspace", async () => {
    const existing = await staffUser();
    await expect(signUpTenant({ ...signup, email: existing.email })).rejects.toMatchObject({ issues: [{ path: "email", messageKey: "validation.emailTaken" }] });
    expect((await listTenantsForPlatform(page)).items.map((tenant) => tenant.slug)).toEqual(["test"]);
  });
});

describe("platform console", () => {
  it("creates a workspace with an admin and a one-time password, and counts its devices and staff", async () => {
    const { tenant, admin, temporaryPassword } = await asPlatform(() =>
      createTenantFromPlatform({ slug: "team", name: "Team", contactEmail: "hello@example.com", adminName: "Rudi", adminEmail: "rudi@example.com" }, 1),
    );
    expect(admin?.tenantId).toBe(tenant.id);
    expect(temporaryPassword).toHaveLength(20);
    expect((await authenticateStaff("rudi@example.com", temporaryPassword as string)).id).toBe(admin?.id);

    await inTenant(tenant.id, () => device(admin?.id ?? 0));
    const listed = (await listTenantsForPlatform({ ...page, search: "team" })).items[0];
    expect(listed).toMatchObject({ slug: "team", staffCount: 1, deviceCount: 1, accountCount: 0 });
    expect((await tenantStatusCounts()).active).toBe(2);
  });

  it("signs a suspended workspace out and closes it until it is active again", async () => {
    const admin = await staffUser();
    await asPlatform(() => insertSession({ userId: admin.id, tokenHash: "hash-1", expiresAt: new Date(Date.now() + 86_400_000), userAgent: null }));
    await asPlatform(() => updateTenant(database.tenantId, { status: "suspended" }, 1));
    expect(await asPlatform(() => database.db.select().from(staffSessions))).toHaveLength(0);
    await expect(authenticateStaff(admin.email, "correct-horse-battery")).rejects.toMatchObject({ messageKey: "errors.tenantInactive" });

    await asPlatform(() => updateTenant(database.tenantId, { status: "active" }, 1));
    expect((await authenticateStaff(admin.email, "correct-horse-battery")).id).toBe(admin.id);
  });

  it("moves a workspace to the trash and back", async () => {
    await asPlatform(() => deleteTenant(database.tenantId, 1));
    expect((await listTenantsForPlatform(page)).total).toBe(0);
    expect((await listTenantsForPlatform({ ...page, trashed: true })).total).toBe(1);
    await asPlatform(() => restoreTenant(database.tenantId, 1));
    expect((await listTenantsForPlatform(page)).total).toBe(1);
  });

  it("keeps platform staff and workspace staff in separate lists", async () => {
    await staffUser();
    await asPlatform(() => createStaff({ name: "Owner", email: "owner@akunmu.test", role: "admin", password: "correct-horse-battery", locale: null }, null));
    expect((await asPlatform(() => listStaff(page))).items.map((user) => user.email)).toEqual(["owner@akunmu.test"]);
    expect((await listStaff(page)).items.map((user) => user.email)).not.toContain("owner@akunmu.test");
  });
});
