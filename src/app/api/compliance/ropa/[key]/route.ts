import { ropaItemHandlers } from "@/server/compliance/handlers";

/** One RoPA record: read, correct fields, or move a custom activity to the trash. Records of the workspace. */
const handlers = ropaItemHandlers("tenant");
export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
