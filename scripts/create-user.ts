/**
 * Creates a staff account and prints a temporary password once.
 *
 *   npm run user:create -- --tenant <tenant slug> --email <email> --name "<name>" --role <admin|editor|viewer>
 *   npm run user:create -- --platform --email <email> --name "<name>"     (AkunMu platform owner console)
 */
import { parseArgs } from "node:util";
import { randomToken } from "../src/shared/crypto/tokens";
import { closeDb } from "../src/shared/db/client";
import { asPlatform, inTenant } from "../src/shared/db/scope";
import { tenantBySlug } from "../src/modules/tenants/service";
import { STAFF_ROLES, type StaffRole } from "../src/modules/users/schema";
import { createStaff } from "../src/modules/users/service";
import { createUserSchema } from "../src/modules/users/validation";

const { values } = parseArgs({
  options: {
    tenant: { type: "string" },
    platform: { type: "boolean", default: false },
    email: { type: "string" },
    name: { type: "string" },
    role: { type: "string", default: "admin" },
  },
});

const role = (STAFF_ROLES as readonly string[]).includes(values.role ?? "") ? (values.role as StaffRole) : null;
if (!values.email || !values.name || !role || (!values.platform && !values.tenant)) {
  console.error(`Usage: npm run user:create -- (--tenant <slug> | --platform) --email <email> --name "<name>" [--role <${STAFF_ROLES.join("|")}>]`);
  process.exit(1);
}

const password = randomToken(15);
try {
  const input = createUserSchema.parse({ email: values.email, name: values.name, role, password });
  let user;
  if (values.platform) {
    user = await asPlatform(() => createStaff(input, null));
  } else {
    const tenant = await tenantBySlug(values.tenant ?? "");
    if (!tenant) throw new Error(`No tenant with the slug "${values.tenant}".`);
    user = await inTenant(tenant.id, () => createStaff(input, null));
  }
  console.log(`Created ${values.platform ? "platform" : user.role} account for ${user.email}.`);
  console.log(`Temporary password (shown once): ${password}`);
} catch (error) {
  console.error("Could not create the account:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
