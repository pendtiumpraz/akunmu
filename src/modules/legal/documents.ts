import { SOURCE_LOCALE, type Locale } from "../../shared/i18n/locales";

/**
 * Public legal documents of the platform (terms, privacy). The texts live in JSON files per language
 * (src/content/legal/<document>.<locale>.json); a missing language falls back to the source language,
 * so adding a language means adding files only. {operator} and {contact} come from the environment.
 */
export const LEGAL_DOCUMENTS = ["terms", "privacy"] as const;
export type LegalDocumentName = (typeof LEGAL_DOCUMENTS)[number];

export type LegalSection = { heading: string; paragraphs?: string[]; items?: string[] };
export type LegalDocument = { title: string; updated: string; intro: string; sections: LegalSection[] };

export function isLegalDocument(value: string): value is LegalDocumentName {
  return (LEGAL_DOCUMENTS as readonly string[]).includes(value);
}

async function importDocument(name: LegalDocumentName, locale: string): Promise<LegalDocument | null> {
  try {
    const loaded = (await import(`../../content/legal/${name}.${locale}.json`)) as { default: LegalDocument };
    return loaded.default;
  } catch {
    return null;
  }
}

function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

/** The document in the requested language (or the source language), with operator and contact filled in. */
export async function loadLegalDocument(name: LegalDocumentName, locale: Locale, values: { operator: string; contact: string }): Promise<LegalDocument> {
  const document = (await importDocument(name, locale)) ?? (await importDocument(name, SOURCE_LOCALE));
  if (!document) throw new Error(`Legal document ${name} is missing.`);
  return {
    ...document,
    intro: fill(document.intro, values),
    sections: document.sections.map((section) => ({
      heading: fill(section.heading, values),
      paragraphs: section.paragraphs?.map((paragraph) => fill(paragraph, values)),
      items: section.items?.map((item) => fill(item, values)),
    })),
  };
}
