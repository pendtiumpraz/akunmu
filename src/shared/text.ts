/** Lowercase ASCII slug: "Bank Jago 2026!" → "bank-jago-2026". */
export function slugify(value: string, maxLength = 60): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}

/** Converts "" and whitespace-only strings to null; leaves other values untouched. */
export function blankToNull<T>(value: T): T | null {
  return typeof value === "string" && value.trim() === "" ? null : value;
}
