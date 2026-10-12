import { incidentRestoreHandler } from "@/server/compliance/handlers";

/** Restores an incident from the trash. Records of the workspace. */
export const PATCH = incidentRestoreHandler("tenant");
