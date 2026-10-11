/** Colors a provider added on the fly starts with (picked by its name; changed on the Providers page). */
const NEW_PROVIDER_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0d9488", "#0891b2", "#4f46e5"];

export function newProviderColor(name: string): string {
  let hash = 0;
  for (const character of name.trim().toLowerCase()) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return NEW_PROVIDER_COLORS[hash % NEW_PROVIDER_COLORS.length];
}

/** A provider's name from its domain: "github.com" → "Github", "mail.example.co.id" → "Example". */
export function providerNameFromDomain(domain: string): string {
  const labels = domain.toLowerCase().split(".").filter(Boolean);
  const secondLevel = new Set(["co", "com", "net", "org", "ac", "go", "or", "my", "web", "sch", "gov", "edu"]);
  let index = labels.length - 2;
  if (index > 0 && secondLevel.has(labels[index]) && labels[labels.length - 1].length === 2) index -= 1;
  const word = labels[Math.max(0, index)] ?? domain;
  return word.charAt(0).toUpperCase() + word.slice(1);
}
