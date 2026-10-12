import { incidentTrashHandler } from "@/server/compliance/handlers";

/** Incidents in the trash. Records of the platform (AkunMu's operator). */
export const GET = incidentTrashHandler("platform");
