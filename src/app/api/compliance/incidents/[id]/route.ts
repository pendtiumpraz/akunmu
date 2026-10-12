import { incidentItemHandlers } from "@/server/compliance/handlers";

/** One incident: read, update or move to the trash. Records of the workspace. */
const handlers = incidentItemHandlers("tenant");
export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
