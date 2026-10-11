/**
 * Single place that reads environment variables, so modules never touch process.env directly.
 * Every value is trimmed; empty strings count as "not set".
 */

const MIN_SECRET_LENGTH = 32;

function read(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Secret used to encrypt stored AI keys (and anything else that must not sit in the database in clear). */
export function appSecret(): string {
  const secret = read("APP_SECRET");
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`APP_SECRET must be a random string of at least ${MIN_SECRET_LENGTH} characters.`);
  }
  return secret;
}

/** Runtime connection string (pooled on Neon). */
export function databaseUrl(): string {
  const url = read("DATABASE_URL") ?? read("POSTGRES_URL");
  if (!url) throw new Error("DATABASE_URL is not set.");
  return url;
}

/** Direct (unpooled) connection string for migrations. */
export function migrationDatabaseUrl(): string {
  return read("DATABASE_URL_UNPOOLED") ?? read("POSTGRES_URL_NON_POOLING") ?? databaseUrl();
}

export function defaultLocaleSetting(): string | undefined {
  return read("DEFAULT_LOCALE");
}

/** The desktop app (Electron shell, local database, served on plain http from 127.0.0.1); never set on Vercel. */
export function isDesktop(): boolean {
  return read("AKUNMU_DESKTOP") === "1";
}

/** The key the desktop shell opens the app with; a new one every launch, known only to the shell and the server. */
export function desktopToken(): string | undefined {
  return isDesktop() ? read("AKUNMU_DESKTOP_TOKEN") : undefined;
}

/** Session cookies are Secure everywhere but on the desktop, which is served over http from the same machine. */
export function secureCookies(): boolean {
  return isProduction() && !isDesktop();
}

/**
 * Where the browser extension reaches AkunMu Desktop: a fixed local port the shell forwards to the app's ingest API
 * (the app itself runs on a new port every launch). Null outside the desktop, or when the shell could not open it.
 */
export function desktopAgentAddress(): string | null {
  return isDesktop() ? (read("AKUNMU_AGENT_ADDRESS") ?? null) : null;
}
