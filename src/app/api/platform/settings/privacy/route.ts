import { privacySettingsHandlers } from "@/server/compliance/handlers";

/** Controller profile, privacy officer (PPDP) and retention periods. Records of the platform (AkunMu's operator). */
const handlers = privacySettingsHandlers("platform");
export const GET = handlers.GET;
export const PUT = handlers.PUT;
