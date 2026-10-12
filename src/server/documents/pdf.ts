import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  EMPTY_VALUE,
  RISK_TONE_COLORS,
  hexToRgb,
  pageLabel,
  tint,
  type ComplianceDocument,
  type DocumentField,
  type DocumentSection,
  type DocumentTable,
  type TableCell,
} from "./model";

/*
 * PDF renderer for compliance documents: A4 pages laid out with pdf-lib, Inter (SIL OFL, assets/fonts) for
 * full Unicode text, automatic line wrapping and page breaks, table headers repeated on new pages, and a
 * footer with the document number and "page X of Y" on every page.
 */

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 50;
const MARGIN_TOP = 54;
const MARGIN_BOTTOM = 66;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

const INK = "#0F172A";
const BODY = "#334155";
const MUTED = "#64748B";
const LINE = "#E2E8F0";
const SOFT = "#F8FAFC";
const WHITE = "#FFFFFF";

/** Cap height of Inter in em, used to center text vertically in boxes. */
const CAP_HEIGHT = 0.727;

type Fonts = { regular: PDFFont; semibold: PDFFont };

let fontBytes: Promise<{ regular: Uint8Array; semibold: Uint8Array }> | null = null;

function loadFontBytes() {
  const read = (file: string) => readFile(join(process.cwd(), "assets", "fonts", file)).then((buffer) => new Uint8Array(buffer));
  fontBytes ??= Promise.all([read("Inter-Regular.ttf"), read("Inter-SemiBold.ttf")])
    .then(([regular, semibold]) => ({ regular, semibold }))
    .catch((error: unknown) => {
      fontBytes = null;
      throw error;
    });
  return fontBytes;
}

function color(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return rgb(r, g, b);
}

/** Removes characters that have no place in a PDF text run (tabs become spaces, CR/LF become LF). */
export function cleanText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "");
}

/** Wraps text to a width; explicit line breaks start new lines and over-long words are broken. */
export function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of cleanText(text).split("\n")) {
    const words = paragraph.split(/ +/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      if (font.widthOfTextAtSize(word, size) <= width) {
        line = word;
        continue;
      }
      let chunk = "";
      for (const character of Array.from(word)) {
        if (chunk && font.widthOfTextAtSize(chunk + character, size) > width) {
          lines.push(chunk);
          chunk = character;
        } else {
          chunk += character;
        }
      }
      line = chunk;
    }
    lines.push(line);
  }
  return lines;
}

/** Shortens text with an ellipsis so it fits the width. */
function fitText(text: string, font: PDFFont, size: number, width: number): string {
  const clean = cleanText(text).replace(/\n/g, " ");
  if (font.widthOfTextAtSize(clean, size) <= width) return clean;
  const characters = Array.from(clean);
  while (characters.length > 1 && font.widthOfTextAtSize(`${characters.join("")}…`, size) > width) characters.pop();
  return `${characters.join("")}…`;
}

class Writer {
  readonly pages: PDFPage[] = [];
  page!: PDFPage;
  /** Distance of the cursor from the top edge of the current page. */
  top = MARGIN_TOP;

  constructor(
    readonly pdf: PDFDocument,
    readonly fonts: Fonts,
    readonly accent: string,
  ) {
    this.newPage();
  }

  newPage() {
    this.page = this.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pages.push(this.page);
    this.top = MARGIN_TOP;
  }

  remaining() {
    return PAGE_HEIGHT - MARGIN_BOTTOM - this.top;
  }

  ensure(height: number) {
    if (height > this.remaining()) this.newPage();
  }

  /** Draws one line of text whose line box starts at `top`. */
  line(text: string, x: number, top: number, size: number, font: PDFFont, hex: string, lineHeight = size * 1.45) {
    if (!text) return;
    const baseline = top + (lineHeight + size * CAP_HEIGHT) / 2;
    this.page.drawText(text, { x, y: PAGE_HEIGHT - baseline, size, font, color: color(hex) });
  }

  rect(x: number, top: number, width: number, height: number, fill?: string, border?: string, borderWidth = 0.6) {
    this.page.drawRectangle({
      x,
      y: PAGE_HEIGHT - top - height,
      width,
      height,
      color: fill ? color(fill) : undefined,
      borderColor: border ? color(border) : undefined,
      borderWidth: border ? borderWidth : 0,
    });
  }

  rule(x: number, top: number, width: number, hex = LINE, thickness = 0.6) {
    this.page.drawLine({
      start: { x, y: PAGE_HEIGHT - top },
      end: { x: x + width, y: PAGE_HEIGHT - top },
      thickness,
      color: color(hex),
    });
  }

  /** Flowing paragraph text with page breaks between lines. */
  paragraph(text: string, x: number, width: number, size: number, font: PDFFont, hex: string, lineHeight = size * 1.45) {
    for (const line of wrapText(text, font, size, width)) {
      this.ensure(lineHeight);
      this.line(line, x, this.top, size, font, hex, lineHeight);
      this.top += lineHeight;
    }
  }
}

function drawCover(writer: Writer, document: ComplianceDocument) {
  const { regular, semibold } = writer.fonts;
  writer.rect(0, 0, PAGE_WIDTH, 6, writer.accent);

  const badgeSize = 8;
  const badgeWidth = semibold.widthOfTextAtSize(document.kindLabel, badgeSize) + 14;
  writer.rect(MARGIN_X, 30, badgeWidth, 17, writer.accent);
  writer.line(document.kindLabel, MARGIN_X + 7, 30, badgeSize, semibold, WHITE, 17);
  const organization = fitText(document.organization, regular, 9, CONTENT_WIDTH - badgeWidth - 16);
  writer.line(organization, PAGE_WIDTH - MARGIN_X - regular.widthOfTextAtSize(organization, 9), 30, 9, regular, MUTED, 17);

  writer.top = 62;
  writer.paragraph(document.title, MARGIN_X, CONTENT_WIDTH, 18, semibold, INK, 24);
  if (document.secondaryTitle) writer.paragraph(document.secondaryTitle, MARGIN_X, CONTENT_WIDTH, 10, regular, MUTED, 15);
  writer.top += 8;
  writer.paragraph(document.subject, MARGIN_X, CONTENT_WIDTH, 14, semibold, writer.accent, 19);
  writer.paragraph(document.code, MARGIN_X, CONTENT_WIDTH, 9.5, regular, MUTED, 15);
  writer.top += 12;

  if (document.summary.length === 0) return;
  const columnWidth = (CONTENT_WIDTH - 24) / 2;
  const rows: Array<Array<{ label: string; value: string }>> = [];
  for (let index = 0; index < document.summary.length; index += 2) rows.push(document.summary.slice(index, index + 2));
  const measured = rows.map((row) =>
    row.map((cell) => ({
      label: wrapText(cell.label.toUpperCase(), semibold, 7, columnWidth),
      value: wrapText(cell.value || EMPTY_VALUE, regular, 9.5, columnWidth),
    })),
  );
  const rowHeights = measured.map((row) => Math.max(...row.map((cell) => cell.label.length * 10 + cell.value.length * 13.5)) + 8);
  const boxHeight = rowHeights.reduce((sum, height) => sum + height, 0) + 12;
  writer.ensure(boxHeight);
  writer.rect(MARGIN_X, writer.top, CONTENT_WIDTH, boxHeight, SOFT, LINE);
  let rowTop = writer.top + 10;
  measured.forEach((row, rowIndex) => {
    row.forEach((cell, cellIndex) => {
      const x = MARGIN_X + 12 + cellIndex * (columnWidth + 12);
      let cursor = rowTop;
      for (const line of cell.label) {
        writer.line(line, x, cursor, 7, semibold, MUTED, 10);
        cursor += 10;
      }
      for (const line of cell.value) {
        writer.line(line, x, cursor, 9.5, regular, INK, 13.5);
        cursor += 13.5;
      }
    });
    rowTop += rowHeights[rowIndex];
  });
  writer.top += boxHeight + 18;
}

function drawSectionHeading(writer: Writer, section: DocumentSection) {
  const { regular, semibold } = writer.fonts;
  const numberWidth = semibold.widthOfTextAtSize(section.number, 12) + 10;
  const titleLines = wrapText(section.title, semibold, 12.5, CONTENT_WIDTH - numberWidth);
  const subtitleLines = section.subtitle ? wrapText(section.subtitle, regular, 8.5, CONTENT_WIDTH) : [];
  // Keep the heading together with at least a few lines of its first field.
  writer.ensure(titleLines.length * 17 + subtitleLines.length * 12 + 70);
  writer.line(section.number, MARGIN_X, writer.top, 12, semibold, writer.accent, 17);
  for (const line of titleLines) {
    writer.line(line, MARGIN_X + numberWidth, writer.top, 12.5, semibold, INK, 17);
    writer.top += 17;
  }
  writer.top += 3;
  writer.rule(MARGIN_X, writer.top, CONTENT_WIDTH, tint(writer.accent, 0.55), 0.8);
  writer.top += 5;
  for (const line of subtitleLines) {
    writer.line(line, MARGIN_X, writer.top, 8.5, regular, MUTED, 12);
    writer.top += 12;
  }
  writer.top += 6;
}

/** `keep` is the height of the value's first part that must stay on the label's page. */
function drawLabel(writer: Writer, label: string, keep: number) {
  const { semibold } = writer.fonts;
  const lines = wrapText(label.toUpperCase(), semibold, 7.5, CONTENT_WIDTH);
  writer.ensure(lines.length * 11 + keep);
  for (const line of lines) {
    writer.line(line, MARGIN_X, writer.top, 7.5, semibold, MUTED, 11);
    writer.top += 11;
  }
  writer.top += 1;
}

function drawList(writer: Writer, items: string[]) {
  const { regular } = writer.fonts;
  if (items.length === 0) {
    writer.paragraph(EMPTY_VALUE, MARGIN_X, CONTENT_WIDTH, 10, regular, BODY);
    return;
  }
  for (const item of items) {
    const lines = wrapText(item, regular, 10, CONTENT_WIDTH - 12);
    lines.forEach((line, index) => {
      writer.ensure(14.5);
      if (index === 0) writer.line("•", MARGIN_X + 1, writer.top, 10, regular, writer.accent, 14.5);
      writer.line(line, MARGIN_X + 12, writer.top, 10, regular, BODY, 14.5);
      writer.top += 14.5;
    });
  }
}

function drawPills(writer: Writer, items: string[]) {
  const { regular } = writer.fonts;
  if (items.length === 0) {
    writer.paragraph(EMPTY_VALUE, MARGIN_X, CONTENT_WIDTH, 10, regular, BODY);
    return;
  }
  const size = 8.5;
  const height = 16;
  const gap = 4;
  const fill = tint(writer.accent, 0.9);
  const border = tint(writer.accent, 0.7);
  let x = MARGIN_X;
  writer.ensure(height + gap);
  for (const item of items) {
    const text = fitText(item, regular, size, CONTENT_WIDTH - 12);
    const width = regular.widthOfTextAtSize(text, size) + 12;
    if (x + width > MARGIN_X + CONTENT_WIDTH && x > MARGIN_X) {
      x = MARGIN_X;
      writer.top += height + gap;
      writer.ensure(height + gap);
    }
    writer.rect(x, writer.top, width, height, fill, border, 0.5);
    writer.line(text, x + 6, writer.top, size, regular, INK, height);
    x += width + gap;
  }
  writer.top += height + gap;
}

function drawKeyValues(writer: Writer, rows: Array<{ key: string; value: string }>) {
  const { regular, semibold } = writer.fonts;
  if (rows.length === 0) {
    writer.paragraph(EMPTY_VALUE, MARGIN_X, CONTENT_WIDTH, 10, regular, BODY);
    return;
  }
  const keyWidth = CONTENT_WIDTH * 0.32;
  const valueWidth = CONTENT_WIDTH - keyWidth;
  for (const row of rows) {
    const keyLines = wrapText(row.key, semibold, 8.5, keyWidth - 12);
    const valueLines = wrapText(row.value || EMPTY_VALUE, regular, 9, valueWidth - 12);
    const height = Math.max(keyLines.length * 12.5, valueLines.length * 13) + 10;
    if (height > writer.remaining()) writer.newPage();
    writer.rect(MARGIN_X, writer.top, keyWidth, height, SOFT, LINE, 0.5);
    writer.rect(MARGIN_X + keyWidth, writer.top, valueWidth, height, WHITE, LINE, 0.5);
    keyLines.forEach((line, index) => writer.line(line, MARGIN_X + 6, writer.top + 5 + index * 12.5, 8.5, semibold, BODY, 12.5));
    valueLines.forEach((line, index) => writer.line(line, MARGIN_X + keyWidth + 6, writer.top + 5 + index * 13, 9, regular, INK, 13));
    writer.top += height;
  }
  writer.top += 4;
}

function drawRisk(writer: Writer, tone: 1 | 2 | 3 | 4 | 5, text: string) {
  const { semibold } = writer.fonts;
  const colors = RISK_TONE_COLORS[tone];
  const width = semibold.widthOfTextAtSize(text, 9) + 18;
  writer.ensure(22);
  writer.rect(MARGIN_X, writer.top, width, 20, colors.fill, colors.text, 0.6);
  writer.line(text, MARGIN_X + 9, writer.top, 9, semibold, colors.text, 20);
  writer.top += 24;
}

function cellText(cell: TableCell): string {
  return typeof cell === "string" ? cell : cell.text;
}

function drawTable(writer: Writer, table: DocumentTable) {
  const { regular, semibold } = writer.fonts;
  const total = table.columns.reduce((sum, column) => sum + column.width, 0) || 1;
  const widths = table.columns.map((column) => (column.width / total) * CONTENT_WIDTH);
  const size = 8;
  const lineHeight = 11;
  const padding = 5;

  const headerLines = table.columns.map((column, index) => wrapText(column.title, semibold, size, widths[index] - padding * 2));
  const headerHeight = Math.max(...headerLines.map((lines) => lines.length)) * lineHeight + padding * 2;
  const drawHeader = () => {
    let x = MARGIN_X;
    table.columns.forEach((column, index) => {
      writer.rect(x, writer.top, widths[index], headerHeight, tint(writer.accent, 0.86), LINE, 0.5);
      headerLines[index].forEach((line, lineIndex) => {
        const offset = column.align === "center" ? (widths[index] - semibold.widthOfTextAtSize(line, size)) / 2 : padding;
        writer.line(line, x + offset, writer.top + padding + lineIndex * lineHeight, size, semibold, INK, lineHeight);
      });
      x += widths[index];
    });
    writer.top += headerHeight;
  };

  if (table.rows.length === 0) {
    writer.ensure(headerHeight + 20);
    drawHeader();
    writer.rect(MARGIN_X, writer.top, CONTENT_WIDTH, 20, WHITE, LINE, 0.5);
    writer.line(EMPTY_VALUE, MARGIN_X + padding, writer.top, size, regular, MUTED, 20);
    writer.top += 26;
    return;
  }

  const firstRowHeight = rowHeight(table.rows[0]);
  writer.ensure(headerHeight + firstRowHeight);
  drawHeader();
  for (const row of table.rows) {
    const height = rowHeight(row);
    if (height > writer.remaining()) {
      writer.newPage();
      drawHeader();
    }
    let x = MARGIN_X;
    row.forEach((cell, index) => {
      const tone = typeof cell === "string" ? undefined : cell.tone;
      const bold = typeof cell !== "string" && cell.bold;
      const font = bold || tone ? semibold : regular;
      const fill = tone ? RISK_TONE_COLORS[tone].fill : WHITE;
      const ink = tone ? RISK_TONE_COLORS[tone].text : INK;
      writer.rect(x, writer.top, widths[index], height, fill, LINE, 0.5);
      const lines = wrapText(cellText(cell) || EMPTY_VALUE, font, size, widths[index] - padding * 2);
      lines.forEach((line, lineIndex) => {
        const offset = table.columns[index]?.align === "center" ? (widths[index] - font.widthOfTextAtSize(line, size)) / 2 : padding;
        writer.line(line, x + offset, writer.top + padding + lineIndex * lineHeight, size, font, ink, lineHeight);
      });
      x += widths[index];
    });
    writer.top += height;
  }
  writer.top += 6;

  function rowHeight(row: TableCell[]) {
    const counts = row.map((cell, index) => {
      const bold = typeof cell !== "string" && (cell.bold || cell.tone);
      return wrapText(cellText(cell) || EMPTY_VALUE, bold ? semibold : regular, size, widths[index] - padding * 2).length;
    });
    return Math.max(1, ...counts) * lineHeight + padding * 2;
  }
}

function drawField(writer: Writer, field: DocumentField) {
  const { regular } = writer.fonts;
  const keep = { table: 64, kv: 36, risk: 26, pills: 22, list: 18, text: 18, longtext: 18 }[field.variant];
  drawLabel(writer, field.label, keep);
  switch (field.variant) {
    case "text":
    case "longtext":
      writer.paragraph(field.value || EMPTY_VALUE, MARGIN_X, CONTENT_WIDTH, 10, regular, BODY);
      break;
    case "list":
      drawList(writer, field.value);
      break;
    case "pills":
      drawPills(writer, field.value);
      break;
    case "kv":
      drawKeyValues(writer, field.value);
      break;
    case "risk":
      drawRisk(writer, field.value.tone, field.value.text);
      break;
    case "table":
      drawTable(writer, field.value);
      break;
  }
  writer.top += 9;
}

function drawFooters(writer: Writer, document: ComplianceDocument) {
  const { regular } = writer.fonts;
  const total = writer.pages.length;
  writer.pages.forEach((page, index) => {
    writer.page = page;
    const top = PAGE_HEIGHT - MARGIN_BOTTOM + 22;
    writer.rule(MARGIN_X, top, CONTENT_WIDTH);
    const label = pageLabel(document.footer.pageTemplate, index + 1, total);
    const labelWidth = regular.widthOfTextAtSize(label, 8);
    const left = fitText(`${document.code} · ${document.subject}`, regular, 8, CONTENT_WIDTH - labelWidth - 16);
    writer.line(left, MARGIN_X, top + 4, 8, regular, MUTED, 12);
    writer.line(label, PAGE_WIDTH - MARGIN_X - labelWidth, top + 4, 8, regular, MUTED, 12);
    writer.line(fitText(`${document.footer.generated} · ${document.footer.product}`, regular, 7, CONTENT_WIDTH), MARGIN_X, top + 16, 7, regular, MUTED, 11);
  });
}

/** Renders the document as a PDF file. */
export async function renderDocumentPdf(document: ComplianceDocument): Promise<Uint8Array> {
  const bytes = await loadFontBytes();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fonts: Fonts = {
    regular: await pdf.embedFont(bytes.regular, { subset: false }),
    semibold: await pdf.embedFont(bytes.semibold, { subset: false }),
  };
  pdf.setTitle(`${document.kindLabel} ${document.code} — ${document.subject}`);
  pdf.setSubject(document.title);
  pdf.setAuthor(document.organization);
  pdf.setCreator(document.footer.product);
  pdf.setProducer(document.footer.product);
  pdf.setLanguage(document.language);

  const writer = new Writer(pdf, fonts, document.accent);
  drawCover(writer, document);
  for (const section of document.sections) {
    drawSectionHeading(writer, section);
    for (const field of section.fields) drawField(writer, field);
    writer.top += 6;
  }
  drawFooters(writer, document);
  return pdf.save();
}
