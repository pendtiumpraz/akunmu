import { dpiaListHandlers } from "@/server/compliance/handlers";

/** Data protection impact assessments: list, or start one for an activity ({ key }). Records of the workspace. */
const handlers = dpiaListHandlers("tenant");
export const GET = handlers.GET;
export const POST = handlers.POST;
