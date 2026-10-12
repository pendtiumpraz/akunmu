import { dpiaTrashHandler } from "@/server/compliance/handlers";

/** DPIAs in the trash. Records of the workspace. */
export const GET = dpiaTrashHandler("tenant");
