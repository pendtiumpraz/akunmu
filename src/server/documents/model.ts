/**
 * Format-neutral model of a compliance document (RoPA record, DPIA, incident report), rendered to PDF
 * (pdf.ts) and Word (docx.ts) from the same data. The shape follows the Privasimu document format: numbered
 * sections, each a list of labelled fields whose variant decides how the value is drawn.
 */

/** Risk levels of the DPIA standard (1 Low … 5 High); colors live in the renderers. */
export type RiskTone = 1 | 2 | 3 | 4 | 5;

export type TableCell = string | { text: string; tone?: RiskTone; bold?: boolean };

export type DocumentTable = {
  /** Relative widths; the renderers scale them to the page width. */
  columns: Array<{ title: string; width: number; align?: "left" | "center" }>;
  rows: TableCell[][];
};

export type DocumentField =
  | { label: string; variant: "text" | "longtext"; value: string }
  | { label: string; variant: "list" | "pills"; value: string[] }
  | { label: string; variant: "kv"; value: Array<{ key: string; value: string }> }
  | { label: string; variant: "risk"; value: { tone: RiskTone; text: string } }
  | { label: string; variant: "table"; value: DocumentTable };

export type DocumentSection = {
  /** Roman numeral or short label shown before the title. */
  number: string;
  title: string;
  /** Legal reference or one-line explanation under the title. */
  subtitle?: string;
  fields: DocumentField[];
};

export type ComplianceDocument = {
  /** Short badge on the cover, e.g. "RoPA" or "DPIA". */
  kindLabel: string;
  /** Formal title in the document language. */
  title: string;
  /** Title in English when the document language is not English (as on Privasimu covers). */
  secondaryTitle?: string;
  /** What the document is about: the processing activity or incident name. */
  subject: string;
  /** Registration number, e.g. RoPA-EVT-001. */
  code: string;
  /** Controller (or processor) that owns the record. */
  organization: string;
  /** Cover summary: label/value pairs shown in a grid. */
  summary: Array<{ label: string; value: string }>;
  sections: DocumentSection[];
  /** BCP 47 language of the text. */
  language: string;
  /** Hex brand color (#rrggbb) for accents. */
  accent: string;
  /** Footer texts, already translated. */
  footer: { generated: string; pageTemplate: string; product: string };
  /** File name without extension. */
  fileName: string;
};

/** Placeholder for empty values, so a blank field reads as "not filled" rather than disappearing. */
export const EMPTY_VALUE = "—";

export function textOrEmpty(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? EMPTY_VALUE : trimmed;
}

/** Fills "{page}" and "{pages}" in the footer page template. */
export function pageLabel(template: string, page: number, pages: number): string {
  return template.replace("{page}", String(page)).replace("{pages}", String(pages));
}

/** A safe file name: letters, digits, dashes and dots only. */
export function safeFileName(value: string): string {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned.slice(0, 80) || "document";
}

export const DOCUMENT_TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

export type DocumentFormat = keyof typeof DOCUMENT_TYPES;

export function isDocumentFormat(value: string | null | undefined): value is DocumentFormat {
  return value === "pdf" || value === "docx";
}

/** Hex color to RGB components in 0..1. Falls back to slate for malformed input. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const value = match ? parseInt(match[1], 16) : 0x334155;
  return { r: ((value >> 16) & 255) / 255, g: ((value >> 8) & 255) / 255, b: (value & 255) / 255 };
}

/** Mixes a color with white; `amount` 0 keeps the color, 1 is white. */
export function tint(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const mix = (channel: number) => Math.round((channel + (1 - channel) * amount) * 255);
  return `#${[mix(r), mix(g), mix(b)].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** Fill and text colors per risk level, shared by both renderers (light fills, dark text). */
export const RISK_TONE_COLORS: Record<RiskTone, { fill: string; text: string }> = {
  1: { fill: "#DCFCE7", text: "#166534" },
  2: { fill: "#ECFCCB", text: "#3F6212" },
  3: { fill: "#FEF9C3", text: "#854D0E" },
  4: { fill: "#FFEDD5", text: "#9A3412" },
  5: { fill: "#FEE2E2", text: "#991B1B" },
};
