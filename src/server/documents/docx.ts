import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from "docx";
import {
  EMPTY_VALUE,
  RISK_TONE_COLORS,
  tint,
  type ComplianceDocument,
  type DocumentField,
  type DocumentSection,
  type DocumentTable,
  type TableCell as ModelCell,
} from "./model";

/*
 * Word renderer for compliance documents. Every table gets explicit column widths in twips: without them
 * the docx library writes 100-twip grid columns, which Google Docs and LibreOffice trust (text then wraps one
 * letter per line). Empty tables still get one row, because the library cannot build a table without rows.
 */

/** A4 content width in twips: 11906 minus 2 cm (1134) margins on both sides. */
const CONTENT_TWIPS = 9638;
const FONT = "Arial";
const INK = "0F172A";
const BODY = "334155";
const MUTED = "64748B";
const LINE = "E2E8F0";
const SOFT = "F8FAFC";
const BULLETS = "compliance-bullets";

const hex = (value: string) => value.replace(/^#/, "").toUpperCase();

/** Plain text with line breaks turned into Word breaks. */
function runs(text: string, options: { bold?: boolean; color?: string; size?: number } = {}): TextRun[] {
  const lines = (text || EMPTY_VALUE).replace(/\r\n?/g, "\n").split("\n");
  return lines.map(
    (line, index) =>
      new TextRun({ text: line, break: index > 0 ? 1 : undefined, bold: options.bold, color: options.color ?? BODY, size: options.size ?? 20, font: FONT }),
  );
}

function border(color = LINE) {
  const side = { style: BorderStyle.SINGLE, size: 4, color };
  return { top: side, bottom: side, left: side, right: side };
}

function shading(fill: string) {
  return { type: ShadingType.SOLID, color: hex(fill), fill: hex(fill) };
}

function cell(children: Paragraph[], width: number, fill?: string) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: border(),
    shading: fill ? shading(fill) : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children,
  });
}

function table(widths: number[], rows: TableRow[]) {
  return new Table({ width: { size: CONTENT_TWIPS, type: WidthType.DXA }, columnWidths: widths, rows });
}

function scaledWidths(weights: number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const widths = weights.map((weight) => Math.max(1, Math.floor((weight / total) * CONTENT_TWIPS)));
  widths[widths.length - 1] += CONTENT_TWIPS - widths.reduce((sum, width) => sum + width, 0);
  return widths;
}

function cover(document: ComplianceDocument): Array<Paragraph | Table> {
  const accent = hex(document.accent);
  const blocks: Array<Paragraph | Table> = [
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({ text: ` ${document.kindLabel} `, bold: true, color: "FFFFFF", size: 16, font: FONT, shading: shading(document.accent) }),
        new TextRun({ text: `   ${document.organization}`, color: MUTED, size: 18, font: FONT }),
      ],
    }),
    new Paragraph({ spacing: { after: 60 }, children: runs(document.title, { bold: true, color: INK, size: 36 }) }),
  ];
  if (document.secondaryTitle) blocks.push(new Paragraph({ spacing: { after: 160 }, children: runs(document.secondaryTitle, { color: MUTED, size: 20 }) }));
  blocks.push(new Paragraph({ spacing: { after: 40 }, children: runs(document.subject, { bold: true, color: accent, size: 28 }) }));
  blocks.push(new Paragraph({ spacing: { after: 200 }, children: runs(document.code, { color: MUTED, size: 19 }) }));

  if (document.summary.length > 0) {
    const widths = scaledWidths([1, 1, 1, 1]);
    const rows: TableRow[] = [];
    for (let index = 0; index < document.summary.length; index += 2) {
      const pair = document.summary.slice(index, index + 2);
      while (pair.length < 2) pair.push({ label: "", value: "" });
      rows.push(
        new TableRow({
          children: pair.flatMap((item, column) => [
            cell([new Paragraph({ children: runs(item.label, { bold: true, color: MUTED, size: 16 }) })], widths[column * 2], SOFT),
            cell([new Paragraph({ children: runs(item.label ? item.value || EMPTY_VALUE : "", { color: INK, size: 19 }) })], widths[column * 2 + 1]),
          ]),
        }),
      );
    }
    blocks.push(table(widths, rows));
  }
  return blocks;
}

function heading(section: DocumentSection, accent: string): Paragraph[] {
  const blocks = [
    new Paragraph({
      spacing: { before: 360, after: section.subtitle ? 60 : 160 },
      keepNext: true,
      border: { bottom: { color: hex(tint(accent, 0.5)), size: 8, style: BorderStyle.SINGLE, space: 4 } },
      children: [
        new TextRun({ text: `${section.number}  `, bold: true, color: hex(accent), size: 26, font: FONT }),
        new TextRun({ text: section.title, bold: true, color: INK, size: 26, font: FONT }),
      ],
    }),
  ];
  if (section.subtitle) {
    blocks.push(new Paragraph({ spacing: { after: 160 }, keepNext: true, children: [new TextRun({ text: section.subtitle, italics: true, color: MUTED, size: 17, font: FONT })] }));
  }
  return blocks;
}

function label(text: string): Paragraph {
  return new Paragraph({ spacing: { before: 140, after: 40 }, keepNext: true, children: runs(text.toUpperCase(), { bold: true, color: MUTED, size: 15 }) });
}

function modelCellText(value: ModelCell): string {
  return typeof value === "string" ? value : value.text;
}

function dataTable(model: DocumentTable, accent: string): Table {
  const widths = scaledWidths(model.columns.map((column) => column.width));
  const header = new TableRow({
    tableHeader: true,
    children: model.columns.map((column, index) =>
      cell(
        [new Paragraph({ alignment: column.align === "center" ? AlignmentType.CENTER : AlignmentType.LEFT, children: runs(column.title, { bold: true, color: INK, size: 16 }) })],
        widths[index],
        tint(accent, 0.86),
      ),
    ),
  });
  const body = (model.rows.length > 0 ? model.rows : [model.columns.map(() => EMPTY_VALUE)]).map(
    (row) =>
      new TableRow({
        cantSplit: true,
        children: model.columns.map((column, index) => {
          const value = row[index] ?? "";
          const tone = typeof value === "string" ? undefined : value.tone;
          const bold = typeof value !== "string" && (value.bold || Boolean(tone));
          return cell(
            [
              new Paragraph({
                alignment: column.align === "center" ? AlignmentType.CENTER : AlignmentType.LEFT,
                children: runs(modelCellText(value) || EMPTY_VALUE, { bold, color: tone ? hex(RISK_TONE_COLORS[tone].text) : INK, size: 16 }),
              }),
            ],
            widths[index],
            tone ? RISK_TONE_COLORS[tone].fill : undefined,
          );
        }),
      }),
  );
  return table(widths, [header, ...body]);
}

function fieldBlocks(field: DocumentField, accent: string): Array<Paragraph | Table> {
  const blocks: Array<Paragraph | Table> = [label(field.label)];
  switch (field.variant) {
    case "text":
    case "longtext":
      blocks.push(new Paragraph({ spacing: { after: 80 }, children: runs(field.value || EMPTY_VALUE) }));
      break;
    case "list":
      if (field.value.length === 0) blocks.push(new Paragraph({ children: runs(EMPTY_VALUE) }));
      for (const item of field.value) blocks.push(new Paragraph({ numbering: { reference: BULLETS, level: 0 }, spacing: { after: 40 }, children: runs(item) }));
      break;
    case "pills": {
      const children: ParagraphChild[] = [];
      field.value.forEach((item, index) => {
        if (index > 0) children.push(new TextRun({ text: "  ", size: 18, font: FONT }));
        children.push(new TextRun({ text: ` ${item} `, color: INK, size: 18, font: FONT, shading: shading(tint(accent, 0.88)) }));
      });
      blocks.push(new Paragraph({ spacing: { after: 80, line: 320 }, children: children.length > 0 ? children : runs(EMPTY_VALUE) }));
      break;
    }
    case "kv": {
      const widths = scaledWidths([32, 68]);
      const rows = (field.value.length > 0 ? field.value : [{ key: EMPTY_VALUE, value: EMPTY_VALUE }]).map(
        (row) =>
          new TableRow({
            cantSplit: true,
            children: [
              cell([new Paragraph({ children: runs(row.key, { bold: true, color: BODY, size: 17 }) })], widths[0], SOFT),
              cell([new Paragraph({ children: runs(row.value || EMPTY_VALUE, { color: INK, size: 18 }) })], widths[1]),
            ],
          }),
      );
      blocks.push(table(widths, rows));
      break;
    }
    case "risk": {
      const colors = RISK_TONE_COLORS[field.value.tone];
      blocks.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [new TextRun({ text: ` ${field.value.text} `, bold: true, color: hex(colors.text), size: 19, font: FONT, shading: shading(colors.fill) })],
        }),
      );
      break;
    }
    case "table":
      blocks.push(dataTable(field.value, accent));
      break;
  }
  return blocks;
}

/** Renders the document as a Word file. */
export async function renderDocumentDocx(document: ComplianceDocument): Promise<Buffer> {
  const children: Array<Paragraph | Table> = [...cover(document)];
  for (const section of document.sections) {
    children.push(...heading(section, document.accent));
    for (const field of section.fields) children.push(...fieldBlocks(field, document.accent));
  }
  const [before, after] = document.footer.pageTemplate.split("{page}");
  const [between, rest] = (after ?? "").split("{pages}");
  const word = new Document({
    title: `${document.kindLabel} ${document.code} — ${document.subject}`,
    subject: document.title,
    creator: document.footer.product,
    description: document.footer.generated,
    styles: { default: { document: { run: { font: FONT, size: 20, color: BODY } } } },
    numbering: {
      config: [
        {
          reference: BULLETS,
          levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 240 } } } }],
        },
      ],
    },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                border: { top: { color: LINE, size: 4, style: BorderStyle.SINGLE, space: 4 } },
                children: [
                  new TextRun({ text: `${document.code} · ${document.subject}    `, color: MUTED, size: 15, font: FONT }),
                  new TextRun({ children: [before ?? "", PageNumber.CURRENT, between ?? "", PageNumber.TOTAL_PAGES, rest ?? ""], color: MUTED, size: 15, font: FONT }),
                ],
              }),
              new Paragraph({ children: [new TextRun({ text: `${document.footer.generated} · ${document.footer.product}`, color: MUTED, size: 13, font: FONT })] }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(word);
}
