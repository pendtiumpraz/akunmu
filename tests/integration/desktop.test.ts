import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DESKTOP_SUPERADMIN_EMAIL, DESKTOP_USER_EMAIL, desktopHome, desktopPeople } from "@/modules/desktop/service";
import { findTenantById } from "@/modules/tenants/repository";
import { updateStaff } from "@/modules/users/service";
import { asPlatform, inTenant } from "@/shared/db";
import { openTestDatabase, type TestDatabase } from "../helpers/database";

let database: TestDatabase;

beforeEach(async () => {
  database = await openTestDatabase();
});

afterEach(async () => {
  await database.close();
});

const DEFAULTS = { userName: "User", superadminName: "Superadmin", workspace: "Personal" };

describe("the desktop app's two people", () => {
  it("are made on the first launch (the user with an active workspace, the superadmin on the platform), once", async () => {
    const people = await desktopPeople(DEFAULTS);
    expect(people.user).toMatchObject({ name: "User", email: DESKTOP_USER_EMAIL, role: "admin", isActive: true });
    expect(people.user.tenantId).not.toBeNull();
    expect(people.superadmin).toMatchObject({ name: "Superadmin", email: DESKTOP_SUPERADMIN_EMAIL, role: "admin", tenantId: null });
    const tenant = await asPlatform(() => findTenantById(people.user.tenantId as number));
    expect(tenant).toMatchObject({ name: "Personal", status: "active" });

    const again = await desktopPeople({ userName: "someone", superadminName: "else", workspace: "Another" });
    expect([again.user.id, again.superadmin.id]).toEqual([people.user.id, people.superadmin.id]);
    expect([desktopHome("user"), desktopHome("superadmin")]).toEqual(["/app", "/platform"]);
  });

  it("are found by role, so changing their addresses in Settings keeps the same people", async () => {
    const people = await desktopPeople(DEFAULTS);
    await inTenant(people.user.tenantId as number, () => updateStaff(people.user.id, { email: "galih@example.com" }, people.user.id));
    await asPlatform(() => updateStaff(people.superadmin.id, { email: "admin@example.com" }, people.superadmin.id));
    const again = await desktopPeople(DEFAULTS);
    expect(again.user).toMatchObject({ id: people.user.id, email: "galih@example.com" });
    expect(again.superadmin).toMatchObject({ id: people.superadmin.id, email: "admin@example.com" });
  });
});
