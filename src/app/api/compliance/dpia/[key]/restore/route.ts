import { dpiaRestoreHandler } from "@/server/compliance/handlers";

/** Restores a DPIA from the trash. Records of the workspace. */
export const PATCH = dpiaRestoreHandler("tenant");
