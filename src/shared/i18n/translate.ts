import type en from "./messages/en.json";

/** Message tree shape; `messages/en.json` is the reference for keys. */
export type Messages = typeof en;

type LeafPaths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : T[K] extends object ? `${K}.${LeafPaths<T[K]>}` : never;
}[keyof T & string];

/** Every translatable key, e.g. "errors.notFound". */
export type MessageKey = LeafPaths<Messages>;

/** Keys that have plural forms (an object with at least an `other` entry), e.g. "devices.count". */
export type PluralKey = MessageKey extends infer K ? (K extends `${infer Base}.other` ? Base : never) : never;

export type TranslateParams = Record<string, string | number>;

export type MessageTree = { [key: string]: string | MessageTree };

export type Translator = {
  (key: MessageKey, params?: TranslateParams): string;
  /** For keys built at runtime (status values and similar). Unknown keys return the key itself. */
  dynamic: (key: string, params?: TranslateParams) => string;
  plural: (key: PluralKey, count: number, params?: TranslateParams) => string;
  has: (key: string) => boolean;
};

function lookup(tree: MessageTree, key: string): string | undefined {
  let node: string | MessageTree | undefined = tree;
  for (const part of key.split(".")) {
    if (node === undefined || typeof node === "string") return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

/** Deep-merges `overrides` over `base`; used to fill missing keys of a locale from the source locale. */
export function mergeMessages(base: MessageTree, overrides: MessageTree): MessageTree {
  const result: MessageTree = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    const current = result[key];
    result[key] =
      typeof value === "object" && typeof current === "object" ? mergeMessages(current, value) : value;
  }
  return result;
}

/**
 * Creates a translator over an already-merged message tree.
 * `intlTag` drives plural rules (Intl.PluralRules) so no language-specific branching is needed.
 */
export function createTranslator(messages: MessageTree, intlTag: string): Translator {
  const pluralRules = new Intl.PluralRules(intlTag);
  const translateDynamic = (key: string, params?: TranslateParams) => {
    const template = lookup(messages, key);
    return template === undefined ? key : interpolate(template, params);
  };
  const translator = ((key: MessageKey, params?: TranslateParams) => translateDynamic(key, params)) as Translator;
  translator.dynamic = translateDynamic;
  translator.has = (key: string) => lookup(messages, key) !== undefined;
  translator.plural = (key: PluralKey, count: number, params?: TranslateParams) => {
    const category = pluralRules.select(count);
    const template = lookup(messages, `${key}.${category}`) ?? lookup(messages, `${key}.other`);
    return template === undefined ? key : interpolate(template, { count, ...params });
  };
  return translator;
}
