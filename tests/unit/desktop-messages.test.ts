import { describe, expect, it } from "vitest";
import en from "../../desktop/src/locales/en.json";
import id from "../../desktop/src/locales/id.json";
import { format, languageFor, messagesFor } from "../../desktop/src/messages";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe("desktop shell messages", () => {
  it("has the same keys and placeholders in both languages, none empty", () => {
    expect(Object.keys(id).sort()).toEqual(Object.keys(en).sort());
    for (const [key, text] of Object.entries(en)) {
      expect(placeholders(id[key as keyof typeof id]), key).toEqual(placeholders(text));
      expect(text.trim(), key).not.toBe("");
      expect(id[key as keyof typeof id].trim(), key).not.toBe("");
    }
  });

  it("speaks Indonesian on an Indonesian system or in Indonesia, English otherwise", () => {
    expect(languageFor(["id-ID"])).toBe("id");
    expect(languageFor(["ID"])).toBe("id");
    // An English Windows set to the Indonesian region (the owner's machine).
    expect(languageFor(["en-US", "en-ID", "en-US"], "ID")).toBe("id");
    expect(languageFor(["en-US", "en-ID"])).toBe("id");
    expect(languageFor(["en-US", "fr-FR"], "US")).toBe("en");
    expect(languageFor(["idx-XX", "en-GB"], "GB")).toBe("en");
    expect(languageFor([""])).toBe("en");
    expect(messagesFor("id").reload).toBe(id.reload);
  });

  it("fills placeholders and leaves unknown ones", () => {
    expect(format("AkunMu {version} {other}", { version: "0.1.0" })).toBe("AkunMu 0.1.0 {other}");
  });
});
