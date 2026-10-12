import { requestTrashHandler } from "@/server/compliance/handlers";

/** Closed requests in the trash. Records of the platform (AkunMu's operator). */
export const GET = requestTrashHandler("platform");
