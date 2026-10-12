import { requestListHandlers } from "@/server/compliance/handlers";

/** Data subject requests: list, or record one received outside the app. Records of the workspace. */
const handlers = requestListHandlers("tenant");
export const GET = handlers.GET;
export const POST = handlers.POST;
