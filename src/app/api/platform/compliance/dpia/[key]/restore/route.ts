import { dpiaRestoreHandler } from "@/server/compliance/handlers";

/** Restores a DPIA from the trash. Records of the platform (AkunMu's operator). */
export const PATCH = dpiaRestoreHandler("platform");
