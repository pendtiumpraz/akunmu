import { dpiaItemHandlers } from "@/server/compliance/handlers";

/** One DPIA: read, update (threshold, texts, risks, sign-off) or move to the trash. Records of the workspace. */
const handlers = dpiaItemHandlers("tenant");
export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
