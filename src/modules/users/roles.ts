/** Staff roles, shared by the server and browser code (no database imports). */
export const STAFF_ROLES = ["admin", "editor", "viewer"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
