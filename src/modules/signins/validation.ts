import { z } from "zod";
import { patchSchema } from "../../shared/patch-schema";
import { safeText } from "../../shared/secrets";
import { blankToNull } from "../../shared/text";
import { isLocalDate } from "../../shared/time";

const id = z.number().int().positive();
const localDate = z.preprocess(blankToNull, z.string().refine(isLocalDate, { error: "validation.date" }).nullish());

/**
 * Records an account as signed in somewhere. The account is either an existing one (`accountId`) or named by
 * provider and identifier, and is then created when the workspace does not have it yet. The place is a
 * browser profile of the device, or the device itself with an optional app name ("Windows", "Gmail app").
 */
export const signInInputSchema = z
  .object({
    accountId: id.nullish(),
    providerId: id.nullish(),
    identifier: z.preprocess(blankToNull, z.string().trim().max(200).nullish()),
    deviceId: id,
    profileId: id.nullish(),
    app: safeText(60),
    since: localDate,
    review: z.boolean().default(false),
    notes: safeText(1000),
  })
  .superRefine((value, context) => {
    if (!value.accountId && !(value.providerId && value.identifier)) {
      context.addIssue({ code: "custom", path: ["identifier"], message: "validation.accountRequired" });
    }
    if (value.profileId && value.app) context.addIssue({ code: "custom", path: ["app"], message: "validation.appWithProfile" });
  });

/** Corrections to a sign-in; signing out and confirming have their own actions. */
export const signInUpdateSchema = patchSchema(
  z.object({
    profileId: id.nullable(),
    app: safeText(60),
    since: localDate,
    review: z.boolean(),
    notes: safeText(1000),
  }),
);

export type SignInInput = z.infer<typeof signInInputSchema>;
export type SignInUpdateInput = z.infer<typeof signInUpdateSchema>;
