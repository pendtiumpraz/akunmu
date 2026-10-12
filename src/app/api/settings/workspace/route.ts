import { z } from "zod";
import { staffRoute } from "@/server/route";
import { loadStoredProfile, savePrivacyProfile } from "@/modules/compliance/profile";
import { deleteWorkspace } from "@/modules/privacy/my-data";
import { getTenant, updateTenant } from "@/modules/tenants/service";
import { workspaceProfileSchema } from "@/modules/tenants/validation";
import { endStaffSession } from "@/modules/users/session";
import { readJson } from "@/shared/http/request";
import { ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";

/**
 * The workspace's own profile, edited by its admins: display name, legal name, contact email and default
 * language (tenant record), plus address, phone and website used as the controller's identity in RoPA and
 * DPIA documents.
 */
const workspaceSchema = workspaceProfileSchema.extend({
  address: z.string().trim().max(500).default(""),
  phone: z.string().trim().max(40).default(""),
  website: z.string().trim().max(200).default(""),
});

const confirmationSchema = z.object({ confirmation: z.string().trim().min(1).max(200) });

async function view(tenantId: number) {
  const [tenant, profile] = await Promise.all([getTenant(tenantId), loadStoredProfile()]);
  return {
    slug: tenant.slug,
    name: tenant.name,
    legalName: tenant.legalName ?? "",
    contactEmail: tenant.contactEmail,
    locale: tenant.locale ?? "",
    address: profile.address,
    phone: profile.phone,
    website: profile.website,
  };
}

export const GET = staffRoute("settings.manage", async ({ staff }) => ok(await view(staff.tenantId), "", 200, { "Cache-Control": "no-store" }));

export const PUT = staffRoute("settings.manage", async ({ request, staff, i18n }) => {
  const input = parseWith(workspaceSchema, await readJson(request));
  await updateTenant(staff.tenantId, { name: input.name, legalName: input.legalName, contactEmail: input.contactEmail, locale: input.locale }, staff.user.id);
  const stored = await loadStoredProfile();
  await savePrivacyProfile({ ...stored, address: input.address, phone: input.phone, website: input.website }, staff.user.id);
  return ok(await view(staff.tenantId), i18n.t("api.updated"));
});

/** Erases the whole workspace for good (admins, after typing its address), then signs the admin out. */
export const DELETE = staffRoute("settings.manage", async ({ request, staff, i18n }) => {
  const { confirmation } = parseWith(confirmationSchema, await readJson(request));
  await deleteWorkspace(staff.user, staff.tenantId, confirmation);
  await endStaffSession();
  return ok({ redirectTo: "/" }, i18n.t("api.workspaceDeleted"));
});
