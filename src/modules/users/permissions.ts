import type { StaffRole } from "./schema";

/**
 * Role-based permissions.
 * admin: everything. editor: the sign-in map (devices, profiles, accounts, sign-ins). viewer: reads the map.
 */
export const PERMISSIONS = {
  "map.read": ["admin", "editor", "viewer"],
  "map.write": ["admin", "editor"],
  "users.manage": ["admin"],
  "settings.manage": ["admin"],
} as const satisfies Record<string, readonly StaffRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: StaffRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly StaffRole[]).includes(role);
}
