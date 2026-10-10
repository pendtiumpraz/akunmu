/**
 * Creates the platform owner (superadmin) and the starting workspaces with their first admin, from a JSON file
 * (default bootstrap.json; see bootstrap.example.json). Idempotent: an existing owner, workspace or admin is kept
 * as it is. Generated passwords are printed once.
 *
 *   npm run platform:bootstrap -- [--file bootstrap.json]
 */
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { z } from "zod";
import { randomToken } from "../src/shared/crypto/tokens";
import { closeDb } from "../src/shared/db/client";
import { asPlatform, inTenant } from "../src/shared/db/scope";
import { createTenant, tenantBySlug } from "../src/modules/tenants/service";
import { tenantInputSchema } from "../src/modules/tenants/validation";
import { createStaff, findStaffByEmailAnywhere } from "../src/modules/users/service";

const person = z.object({ name: z.string().trim().min(1), email: z.email() });

const configSchema = z.object({
  owner: person,
  tenants: z.array(z.object({ slug: z.string(), name: z.string(), contactEmail: z.email(), admin: person })),
});

const { values } = parseArgs({ options: { file: { type: "string", default: "bootstrap.json" } } });

/** Creates a staff account with a generated password unless the email is already in use. */
async function ensureStaff(who: { name: string; email: string }, label: string): Promise<void> {
  if (await findStaffByEmailAnywhere(who.email)) {
    console.log(`${label}: ${who.email} already exists, kept.`);
    return;
  }
  const password = randomToken(15);
  await createStaff({ name: who.name, email: who.email.toLowerCase(), role: "admin", password, locale: null }, null);
  console.log(`${label}: ${who.email} created. Temporary password (shown once): ${password}`);
}

try {
  const config = configSchema.parse(JSON.parse(await readFile(values.file ?? "bootstrap.json", "utf8")));

  await asPlatform(() => ensureStaff(config.owner, "Superadmin (platform owner)"));

  for (const entry of config.tenants) {
    const existing = await tenantBySlug(entry.slug);
    const tenant = existing ?? (await createTenant(tenantInputSchema.parse({ slug: entry.slug, name: entry.name, contactEmail: entry.contactEmail }), null));
    console.log(existing ? `Workspace ${tenant.slug}: already exists, kept.` : `Workspace ${tenant.slug}: created.`);
    await inTenant(tenant.id, () => ensureStaff(entry.admin, `Admin of ${tenant.slug}`));
  }
  console.log("Bootstrap finished. Sign in at /login; the superadmin lands on /platform.");
} catch (error) {
  console.error("Bootstrap failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
