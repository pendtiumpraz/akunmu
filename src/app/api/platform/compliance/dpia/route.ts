import { dpiaListHandlers } from "@/server/compliance/handlers";

/** Data protection impact assessments: list, or start one for an activity ({ key }). Records of the platform (AkunMu's operator). */
const handlers = dpiaListHandlers("platform");
export const GET = handlers.GET;
export const POST = handlers.POST;
