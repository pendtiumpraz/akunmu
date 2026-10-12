import type { StaffRole } from "./schema";

/**
 * Role-based permissions.
 * admin: everything. editor: the sign-in map (devices, profiles, accounts, sign-ins) and reads the privacy records
 * (RoPA, DPIA, incidents, requests). viewer: reads the map.
 */
export const PERMISSIONS = {
  "map.read": ["admin", "editor", "viewer"],
  "map.write": ["admin", "editor"],
  "users.manage": ["admin"],
  "settings.manage": ["admin"],
  "privacy.read": ["admin", "editor"],
  "privacy.manage": ["admin"],
} as const satisfies Record<string, readonly StaffRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: StaffRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly StaffRole[]).includes(role);
}
