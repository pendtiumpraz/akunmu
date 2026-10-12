import { ropaResetHandler } from "@/server/compliance/handlers";

/** Drops every correction of a catalog record (back to the defaults). Records of the workspace. */
export const POST = ropaResetHandler("tenant");
