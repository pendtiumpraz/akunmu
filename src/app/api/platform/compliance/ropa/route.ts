import { ropaListHandlers } from "@/server/compliance/handlers";

/** Records of processing activities: list every record, or add a custom activity. Records of the platform (AkunMu's operator). */
const handlers = ropaListHandlers("platform");
export const GET = handlers.GET;
export const POST = handlers.POST;
