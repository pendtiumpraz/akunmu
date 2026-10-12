import { overviewHandler } from "@/server/compliance/handlers";

/** Compliance overview: record counts, DPIAs still needed, open requests and overdue incidents. Records of the platform (AkunMu's operator). */
export const GET = overviewHandler("platform");
