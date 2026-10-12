import { privacySettingsHandlers } from "@/server/compliance/handlers";

/** Controller profile, privacy officer (PPDP) and retention periods. Records of the workspace. */
const handlers = privacySettingsHandlers("tenant");
export const GET = handlers.GET;
export const PUT = handlers.PUT;
