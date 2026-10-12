import { ropaResetHandler } from "@/server/compliance/handlers";

/** Drops every correction of a catalog record (back to the defaults). Records of the platform (AkunMu's operator). */
export const POST = ropaResetHandler("platform");
