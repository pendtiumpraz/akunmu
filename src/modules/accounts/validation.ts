import { z } from "zod";
import { patchSchema } from "../../shared/patch-schema";
import { safeText } from "../../shared/secrets";
import { blankToNull } from "../../shared/text";
import { TWO_FACTOR_STATES } from "./types";

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, { error: "validation.color" });

export const providerInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  domain: z.preprocess(
    blankToNull,
    z
      .string()
      .trim()
      .toLowerCase()
      .max(120)
      .regex(/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/, { error: "validation.domain" })
      .nullish(),
  ),
  color,
});

export const providerUpdateSchema = patchSchema(providerInputSchema);

export const accountInputSchema = z.object({
  providerId: z.number().int().positive(),
  /** The name the account signs in with: email, username or phone number. */
  identifier: z.string().trim().min(1).max(200),
  label: safeText(60),
  twoFactor: z.enum(TWO_FACTOR_STATES).default("unknown"),
  notes: safeText(1000),
});

export const accountUpdateSchema = patchSchema(accountInputSchema);

export type ProviderInput = z.infer<typeof providerInputSchema>;
export type ProviderUpdateInput = z.infer<typeof providerUpdateSchema>;
export type AccountInput = z.infer<typeof accountInputSchema>;
export type AccountUpdateInput = z.infer<typeof accountUpdateSchema>;
