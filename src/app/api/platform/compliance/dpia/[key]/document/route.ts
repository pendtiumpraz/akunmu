import { dpiaDocumentHandler } from "@/server/compliance/handlers";

/** Laying out a long document takes a few seconds. */
export const maxDuration = 60;

/** The DPIA as PDF or DOCX (?format=pdf|docx&lang=id|en). Records of the platform (AkunMu's operator). */
export const GET = dpiaDocumentHandler("platform");
