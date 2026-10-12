import { incidentListHandlers } from "@/server/compliance/handlers";

/** Breach register: list incidents, or record a new one. Records of the workspace. */
const handlers = incidentListHandlers("tenant");
export const GET = handlers.GET;
export const POST = handlers.POST;
