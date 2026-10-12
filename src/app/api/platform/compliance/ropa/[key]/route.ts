import { ropaItemHandlers } from "@/server/compliance/handlers";

/** One RoPA record: read, correct fields, or move a custom activity to the trash. Records of the platform (AkunMu's operator). */
const handlers = ropaItemHandlers("platform");
export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
