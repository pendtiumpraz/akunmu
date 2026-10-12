import { ropaDocumentHandler } from "@/server/compliance/handlers";

/** Laying out a long document takes a few seconds. */
export const maxDuration = 60;

/** The RoPA record as PDF or DOCX (?format=pdf|docx&lang=id|en). Records of the workspace. */
export const GET = ropaDocumentHandler("tenant");
