import { z } from "zod";
import { patchSchema } from "../../shared/patch-schema";
import { safeText } from "../../shared/secrets";
import { blankToNull } from "../../shared/text";
import { BROWSERS, DEVICE_KINDS, DEVICE_SYSTEMS } from "./types";

export const deviceInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(DEVICE_KINDS).default("laptop"),
  system: z.enum(DEVICE_SYSTEMS).default("other"),
  location: safeText(80),
  notes: safeText(1000),
  /** The computer's own name (as the system shows it), so AkunMu Desktop knows a device is the computer it runs on. */
  hostname: z.preprocess(
    blankToNull,
    z
      .string()
      .trim()
      .toLowerCase()
      .max(253)
      .regex(/^[a-z0-9][a-z0-9._-]*$/, { error: "validation.hostname" })
      .nullish(),
  ),
});

export const deviceUpdateSchema = patchSchema(deviceInputSchema);

export const profileInputSchema = z.object({
  browser: z.enum(BROWSERS).default("chrome"),
  name: z.string().trim().min(1).max(60),
  syncAccountId: z.number().int().positive().nullish(),
  color: z.preprocess(blankToNull, z.string().regex(/^#[0-9a-fA-F]{6}$/, { error: "validation.color" }).nullish()),
  notes: safeText(1000),
});

export const profileUpdateSchema = patchSchema(profileInputSchema);

export type DeviceInput = z.infer<typeof deviceInputSchema>;
export type DeviceUpdateInput = z.infer<typeof deviceUpdateSchema>;
export type ProfileInput = z.infer<typeof profileInputSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
