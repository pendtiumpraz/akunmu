import { z } from "zod";
import { patchSchema } from "../../shared/patch-schema";
import { safeText } from "../../shared/secrets";
import { blankToNull } from "../../shared/text";

/** An address typed without its scheme ("example.com") gets https://. */
function withScheme(value: unknown): unknown {
  const text = blankToNull(value);
  return typeof text === "string" && !/^[a-z][a-z0-9+.-]*:\/\//i.test(text.trim()) ? `https://${text.trim()}` : text;
}

export const projectInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  url: z.preprocess(withScheme, z.url({ protocol: /^https?$/, error: "validation.url" }).max(500).nullish()),
  notes: safeText(1000),
  /** The login sessions working on it; replaces the list when sent. */
  signInIds: z.array(z.number().int().positive()).max(100).default([]),
});

export const projectUpdateSchema = patchSchema(projectInputSchema);

export type ProjectInput = z.infer<typeof projectInputSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
