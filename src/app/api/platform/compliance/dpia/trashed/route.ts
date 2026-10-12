import { dpiaTrashHandler } from "@/server/compliance/handlers";

/** DPIAs in the trash. Records of the platform (AkunMu's operator). */
export const GET = dpiaTrashHandler("platform");
