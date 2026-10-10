import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { findAccountsByText } from "@/modules/accounts/repository";
import { devices } from "@/modules/devices/schema";
import { deviceDetail, listDevicesView } from "@/modules/devices/service";
import { mapView } from "@/modules/signins/service";
import { tenants } from "@/modules/tenants/schema";
import { authenticateStaff, createStaff } from "@/modules/users/service";
import { asPlatform, inTenant } from "@/shared/db";
import { setFallbackScope } from "@/shared/db/scope";
import { createTestTenant, openTestDatabase, type TestDatabase } from "../helpers/database";
import { browserProfile, device, signIn, staffUser } from "../helpers/fixtures";

let database: TestDatabase;

beforeEach(async () => {
  database = await openTestDatabase();
});

afterEach(async () => {
  await database.close();
});

async function count(table: "devices" | "accounts" | "sign_ins"): Promise<number> {
  const result = await database.db.execute(sql`select count(*)::int as total from ${sql.identifier(table)}`);
  return Number((result as unknown as { rows?: { total: number }[] }).rows?.[0]?.total ?? (result as unknown as { total: number }[])[0]?.total);
}

describe("workspace isolation (row level security)", () => {
  it("keeps one workspace's devices, accounts and sign-ins invisible to another, even through raw SQL", async () => {
    const admin = await staffUser();
    const laptop = await device(admin.id, { name: "Office laptop" });
    const work = await browserProfile(laptop.id, admin.id, { name: "Work" });
    await signIn(admin.id, { deviceId: laptop.id, profileId: work.id }, { provider: "google", identifier: "work@example.com" });
    const other = await createTestTenant(database.owner, "workspace-b");

    await inTenant(other, async () => {
      expect(await listDevicesView()).toHaveLength(0);
      await expect(deviceDetail(laptop.id)).rejects.toMatchObject({ status: 404 });
      expect(await findAccountsByText("work@")).toHaveLength(0);
      expect((await mapView()).signIns).toHaveLength(0);
      expect(await count("devices")).toBe(0);
      expect(await count("accounts")).toBe(0);
      expect(await count("sign_ins")).toBe(0);
    });
    expect(await count("sign_ins")).toBe(1);
    expect(await asPlatform(() => count("devices"))).toBe(1);
  });

  it("refuses rows written for another workspace and silently skips updates of theirs", async () => {
    const admin = await staffUser();
    const laptop = await device(admin.id);
    const other = await createTestTenant(database.owner, "workspace-b");

    await inTenant(other, async () => {
      await expect(database.db.insert(devices).values({ name: "Forged", tenantId: database.tenantId } as never)).rejects.toThrow();
      const changed = await database.db.update(devices).set({ name: "Hijacked" }).where(eq(devices.id, laptop.id)).returning();
      expect(changed).toHaveLength(0);
    });
    expect((await deviceDetail(laptop.id)).name).toBe(laptop.name);
  });

  it("lets two workspaces record the same account without clashing", async () => {
    const admin = await staffUser();
    const laptop = await device(admin.id);
    await signIn(admin.id, { deviceId: laptop.id }, { provider: "google", identifier: "shared@example.com" });
    const other = await createTestTenant(database.owner, "workspace-b");

    await inTenant(other, async () => {
      const otherAdmin = await staffUser();
      const phone = await device(otherAdmin.id, { kind: "phone" });
      const row = await signIn(otherAdmin.id, { deviceId: phone.id }, { provider: "google", identifier: "shared@example.com" });
      expect(row.accountCreated).toBe(true);
    });
  });

  it("protects every table that has a tenant_id column with forced row level security", async () => {
    const result = await database.owner.execute(sql`
      select c.relname as name, c.relrowsecurity as enabled, c.relforcerowsecurity as forced,
             (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      where c.relkind = 'r'
        and exists (select 1 from information_schema.columns col where col.table_schema = 'public' and col.table_name = c.relname and col.column_name = 'tenant_id')
      order by c.relname`);
    const rows = ((result as unknown as { rows?: unknown[] }).rows ?? (result as unknown as unknown[])) as { name: string; enabled: boolean; forced: boolean; policies: number }[];
    expect(rows.map((row) => row.name)).toEqual(expect.arrayContaining(["devices", "browser_profiles", "providers", "accounts", "sign_ins"]));
    const unprotected = rows.filter((row) => !row.enabled || !row.forced || row.policies === 0).map((row) => row.name);
    expect(unprotected).toEqual([]);
  });

  it("shows nothing without a scope", async () => {
    const admin = await staffUser();
    await device(admin.id);
    setFallbackScope(null);
    expect(await count("devices")).toBe(0);
    setFallbackScope({ tenantId: database.tenantId, platform: false });
  });

  it("keeps staff emails unique across workspaces", async () => {
    const admin = await staffUser();
    const other = await createTestTenant(database.owner, "workspace-b");
    await inTenant(other, async () => {
      await expect(createStaff({ name: "Copycat", email: admin.email.toUpperCase(), role: "admin", password: "correct-horse-battery", locale: null }, null)).rejects.toMatchObject({
        status: 409,
        messageKey: "errors.emailTaken",
      });
    });
  });

  it("closes sign-in of a suspended workspace", async () => {
    const admin = await staffUser();
    expect((await authenticateStaff(admin.email, "correct-horse-battery")).id).toBe(admin.id);
    await database.owner.update(tenants).set({ status: "suspended" }).where(eq(tenants.id, database.tenantId));
    await expect(authenticateStaff(admin.email, "correct-horse-battery")).rejects.toMatchObject({ messageKey: "errors.tenantInactive" });
  });
});
