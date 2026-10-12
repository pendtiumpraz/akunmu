import { ropaRestoreHandler } from "@/server/compliance/handlers";

/** Restores a custom activity from the trash. Records of the workspace. */
export const PATCH = ropaRestoreHandler("tenant");
