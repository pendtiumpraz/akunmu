import { requestItemHandlers } from "@/server/compliance/handlers";

/** Answer a request (status and reply), or move a closed one to the trash. Records of the platform (AkunMu's operator). */
const handlers = requestItemHandlers("platform");
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
