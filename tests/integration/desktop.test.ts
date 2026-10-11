import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DESKTOP_OWNER_EMAIL, desktopOwner } from "@/modules/desktop/service";
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

describe("the desktop owner", () => {
  it("is made with an active workspace on the first launch and found again on the next ones", async () => {
    const owner = await desktopOwner({ name: "galih", workspace: "Personal" });
    expect(owner).toMatchObject({ name: "galih", email: DESKTOP_OWNER_EMAIL, role: "admin", isActive: true });
    expect(owner.tenantId).not.toBeNull();
    const tenant = await asPlatform(() => findTenantById(owner.tenantId as number));
    expect(tenant).toMatchObject({ name: "Personal", status: "active" });

    const again = await desktopOwner({ name: "someone else", workspace: "Another" });
    expect(again.id).toBe(owner.id);
  });

  it("is found by role, so changing the address in Settings keeps the same workspace", async () => {
    const owner = await desktopOwner({ name: "galih", workspace: "Personal" });
    await inTenant(owner.tenantId as number, () => updateStaff(owner.id, { email: "galih@example.com" }, owner.id));
    const again = await desktopOwner({ name: "galih", workspace: "Personal" });
    expect(again).toMatchObject({ id: owner.id, email: "galih@example.com" });
  });
});
