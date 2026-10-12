import { requestRestoreHandler } from "@/server/compliance/handlers";

/** Restores a request from the trash. Records of the workspace. */
export const PATCH = requestRestoreHandler("tenant");
