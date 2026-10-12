import { requestListHandlers } from "@/server/compliance/handlers";

/** Data subject requests: list, or record one received outside the app. Records of the platform (AkunMu's operator). */
const handlers = requestListHandlers("platform");
export const GET = handlers.GET;
export const POST = handlers.POST;
