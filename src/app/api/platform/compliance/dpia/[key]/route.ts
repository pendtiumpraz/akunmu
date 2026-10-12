import { dpiaItemHandlers } from "@/server/compliance/handlers";

/** One DPIA: read, update (threshold, texts, risks, sign-off) or move to the trash. Records of the platform (AkunMu's operator). */
const handlers = dpiaItemHandlers("platform");
export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
