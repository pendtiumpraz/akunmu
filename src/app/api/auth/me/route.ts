import { staffRoute } from "@/server/route";
import { PERMISSIONS, can, type Permission } from "@/modules/users/permissions";
import { toPublicUser } from "@/modules/users/service";
import { ok } from "@/shared/http/respond";

export const GET = staffRoute(null, async ({ staff }) => {
  const permissions = (Object.keys(PERMISSIONS) as Permission[]).filter((permission) => can(staff.user.role, permission));
  return ok({ user: toPublicUser(staff.user), permissions });
});
