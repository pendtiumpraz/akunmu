import { incidentListHandlers } from "@/server/compliance/handlers";

/** Breach register: list incidents, or record a new one. Records of the platform (AkunMu's operator). */
const handlers = incidentListHandlers("platform");
export const GET = handlers.GET;
export const POST = handlers.POST;
