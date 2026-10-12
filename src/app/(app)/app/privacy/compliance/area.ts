import type { ComplianceScope } from "@/modules/compliance/ropa";

/** Where the screens of one compliance area live: the workspace app or the platform console. */
export type ComplianceArea = {
  scope: ComplianceScope;
  /** API root, e.g. /api/compliance or /api/platform/compliance. */
  api: string;
  /** Page root, e.g. /app/privacy or /platform/privacy. */
  pages: string;
  canManage: boolean;
};

export function tenantArea(canManage: boolean): ComplianceArea {
  return { scope: "tenant", api: "/api/compliance", pages: "/app/privacy", canManage };
}

export const PLATFORM_AREA: ComplianceArea = { scope: "platform", api: "/api/platform/compliance", pages: "/platform/privacy", canManage: true };
