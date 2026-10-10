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
