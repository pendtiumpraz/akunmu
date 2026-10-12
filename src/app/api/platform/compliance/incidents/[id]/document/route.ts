import { incidentDocumentHandler } from "@/server/compliance/handlers";

/** Laying out a long document takes a few seconds. */
export const maxDuration = 60;

/** The incident documentation (PP 33/2026 Art. 116) as PDF or DOCX. Records of the platform (AkunMu's operator). */
export const GET = incidentDocumentHandler("platform");
