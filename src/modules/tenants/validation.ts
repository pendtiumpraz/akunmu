import { z } from "zod";
import { blankToNull } from "../../shared/text";
import { TENANT_STATUSES } from "./types";

/** Tenant slugs identify a workspace (platform console, support): lowercase letters, digits and dashes. */
export const tenantSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: "validation.slug" });

export const tenantInputSchema = z.object({
  slug: tenantSlugSchema,
  name: z.string().trim().min(2).max(120),
  legalName: z.preprocess(blankToNull, z.string().trim().max(200).nullish()),
  contactEmail: z.email({ error: "validation.email" }).max(200).transform((value) => value.trim().toLowerCase()),
  locale: z.preprocess(blankToNull, z.string().trim().max(10).nullish()),
});

export type TenantInput = z.infer<typeof tenantInputSchema>;

/** Platform console edits; the slug is fixed after creation. */
export const tenantUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    legalName: z.preprocess(blankToNull, z.string().trim().max(200).nullish()),
    contactEmail: z.email({ error: "validation.email" }).max(200).transform((value) => value.trim().toLowerCase()),
    status: z.enum(TENANT_STATUSES),
    locale: z.preprocess(blankToNull, z.string().trim().max(10).nullish()),
  })
  .partial();

/** Platform console: a new tenant, optionally with its first admin (a temporary password is generated). */
export const platformTenantInputSchema = tenantInputSchema.extend({
  status: z.enum(TENANT_STATUSES).optional(),
  adminName: z.preprocess(blankToNull, z.string().trim().min(1).max(120).nullish()),
  adminEmail: z.preprocess(blankToNull, z.email({ error: "validation.email" }).max(200).nullish()),
});

/** Self-service sign-up of a workspace and its first admin; the workspace address (slug) follows its name. */
export const signupSchema = z.object({
  workspace: z.string().trim().min(2).max(120),
  name: z.string().trim().min(1).max(120),
  email: z.email({ error: "validation.email" }).max(200).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(10).max(200),
});

export type TenantUpdateInput = z.infer<typeof tenantUpdateSchema>;
export type PlatformTenantInput = z.infer<typeof platformTenantInputSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
