import { describe, expect, it } from "vitest";
import en from "@/shared/i18n/messages/en.json";
import id from "@/shared/i18n/messages/id.json";
import { LOCALES, LOCALE_CODES, SOURCE_LOCALE, matchAcceptLanguage } from "@/shared/i18n/locales";
import { createTranslator, mergeMessages, type MessageTree } from "@/shared/i18n/translate";

function leaves(tree: MessageTree, prefix = ""): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") result.set(path, value);
    else for (const [childKey, childValue] of leaves(value, path)) result.set(childKey, childValue);
  }
  return result;
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe("language files", () => {
  const source = leaves(en as MessageTree);
  const indonesian = leaves(id as MessageTree);

  it("Indonesian and English define exactly the same keys", () => {
    const missingInId = [...source.keys()].filter((key) => !indonesian.has(key));
    const extraInId = [...indonesian.keys()].filter((key) => !source.has(key));
    expect({ missingInId, extraInId }).toEqual({ missingInId: [], extraInId: [] });
  });

  it("uses the same placeholders in every language", () => {
    const mismatched = [...source.entries()]
      .filter(([key, value]) => JSON.stringify(placeholders(value)) !== JSON.stringify(placeholders(indonesian.get(key) ?? "")))
      .map(([key]) => key);
    expect(mismatched).toEqual([]);
  });

  it("has no empty translations", () => {
    expect([...source.entries(), ...indonesian.entries()].filter(([, value]) => value.trim() === "")).toEqual([]);
  });

  it("every registered locale loads and only uses known keys", async () => {
    for (const locale of LOCALES) {
      const messages = leaves((await locale.load()).default as MessageTree);
      expect([...messages.keys()].filter((key) => !source.has(key)), locale.code).toEqual([]);
    }
  });
});

describe("locale registry", () => {
  it("lists unique codes and includes the source language", () => {
    expect(new Set(LOCALE_CODES).size).toBe(LOCALE_CODES.length);
    expect(LOCALE_CODES).toContain(SOURCE_LOCALE);
    expect(LOCALE_CODES).toEqual(expect.arrayContaining(["id", "en"]));
  });

  it("matches Accept-Language headers", () => {
    expect(matchAcceptLanguage("id-ID,id;q=0.9,en;q=0.8")).toBe("id");
    expect(matchAcceptLanguage("fr-FR,en-GB;q=0.7")).toBe("en");
    expect(matchAcceptLanguage("fr-FR")).toBeUndefined();
  });
});

describe("translator", () => {
  it("falls back to the source language, so a new language can ship partially translated", () => {
    const partial = { nav: { map: "Carte des connexions" } };
    const t = createTranslator(mergeMessages(en as MessageTree, partial), "fr-FR");
    expect(t("nav.map")).toBe("Carte des connexions");
    expect(t("nav.devices")).toBe(en.nav.devices);
  });

  it("interpolates parameters and reports unknown dynamic keys", () => {
    const t = createTranslator(id as MessageTree, "id-ID");
    expect(t("devices.deleteBody", { name: "Laptop Kantor" })).toContain("Laptop Kantor");
    expect(t.dynamic("does.not.exist")).toBe("does.not.exist");
  });
});
