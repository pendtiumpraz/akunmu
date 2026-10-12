import { incidentTrashHandler } from "@/server/compliance/handlers";

/** Incidents in the trash. Records of the workspace. */
export const GET = incidentTrashHandler("tenant");
