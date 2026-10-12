import { requestRestoreHandler } from "@/server/compliance/handlers";

/** Restores a request from the trash. Records of the platform (AkunMu's operator). */
export const PATCH = requestRestoreHandler("platform");
