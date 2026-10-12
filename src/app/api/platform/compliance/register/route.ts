import { registerDocumentHandler } from "@/server/compliance/handlers";

/** Laying out a long document takes a few seconds. */
export const maxDuration = 60;

/** The whole register of processing activities as PDF or DOCX. Records of the platform (AkunMu's operator). */
export const GET = registerDocumentHandler("platform");
