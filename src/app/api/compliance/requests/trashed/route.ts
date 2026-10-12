import { requestTrashHandler } from "@/server/compliance/handlers";

/** Closed requests in the trash. Records of the workspace. */
export const GET = requestTrashHandler("tenant");
