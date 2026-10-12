import { ropaListHandlers } from "@/server/compliance/handlers";

/** Records of processing activities: list every record, or add a custom activity. Records of the workspace. */
const handlers = ropaListHandlers("tenant");
export const GET = handlers.GET;
export const POST = handlers.POST;
