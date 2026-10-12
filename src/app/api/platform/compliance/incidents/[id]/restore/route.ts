import { incidentRestoreHandler } from "@/server/compliance/handlers";

/** Restores an incident from the trash. Records of the platform (AkunMu's operator). */
export const PATCH = incidentRestoreHandler("platform");
