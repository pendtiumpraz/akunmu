import { z } from "zod";

/**
 * Schema for PATCH bodies: every field optional, and fields left out stay out of the result.
 * Plain `.partial()` is not enough in Zod 4: it still fills `.default()` values for missing keys, so an update
 * that sends only a title would quietly reset the status, time zone, form fields or draw settings.
 * Validation (refinements, messages, paths) is the full schema's.
 */
export function patchSchema<Shape extends z.ZodRawShape>(schema: z.ZodObject<Shape>) {
  const partial = schema.partial();
  type Patch = z.output<typeof partial>;
  return z.unknown().transform((input, ctx): Patch => {
    const result = partial.safeParse(input);
    if (!result.success) {
      for (const issue of result.error.issues) ctx.addIssue({ ...issue } as Parameters<typeof ctx.addIssue>[0]);
      return z.NEVER;
    }
    const sent = new Set(input && typeof input === "object" ? Object.keys(input) : []);
    return Object.fromEntries(Object.entries(result.data).filter(([key]) => sent.has(key))) as Patch;
  });
}
