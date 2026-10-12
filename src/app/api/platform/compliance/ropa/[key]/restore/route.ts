import { ropaRestoreHandler } from "@/server/compliance/handlers";

/** Restores a custom activity from the trash. Records of the platform (AkunMu's operator). */
export const PATCH = ropaRestoreHandler("platform");
