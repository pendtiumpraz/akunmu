import { redirect } from "next/navigation";
import { can, type Permission } from "@/modules/users/permissions";
import { readStaffSession, type StaffContext } from "@/modules/users/session";

export type TenantStaff = StaffContext & { tenantId: number };

/**
 * Guard for tenant staff pages: redirects to /login without a session, platform staff to their console,
 * and to /app without the permission. Pages load their data with inTenant(staff.tenantId, …).
 */
export async function requireStaffPage(permission?: Permission): Promise<TenantStaff> {
  const staff = await readStaffSession();
  if (!staff) redirect("/login");
  if (staff.tenantId === null) redirect("/platform");
  if (permission && !can(staff.user.role, permission)) redirect("/app");
  return { ...staff, tenantId: staff.tenantId };
}

/** Guard for platform console pages (AkunMu owner and support staff). */
export async function requirePlatformPage(): Promise<StaffContext> {
  const staff = await readStaffSession();
  if (!staff) redirect("/login");
  if (staff.tenantId !== null) redirect("/app");
  return staff;
}
