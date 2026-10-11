import { z } from "zod";
import { blankToNull } from "../../shared/text";
import { BROWSERS } from "../devices/types";
import { AGENT_KINDS } from "./types";

const domain = z
  .string()
  .trim()
  .toLowerCase()
  .max(120)
  .regex(/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/, { error: "validation.domain" });
const identifier = z.preprocess(blankToNull, z.string().trim().max(200).nullish());

export const ingestTokenInputSchema = z.object({
  deviceId: z.number().int().positive(),
  name: z.string().trim().min(1).max(60),
});

/**
 * What an agent (the browser extension) reports about one browser profile: the profile, the sites it found signed in
 * (with the account when it could read it), and every site it looked at. Never cookies, keys or passwords.
 */
export const ingestReportSchema = z.object({
  agent: z.object({ kind: z.enum(AGENT_KINDS), version: z.string().trim().max(20).default("") }),
  browser: z.enum(BROWSERS).default("chrome"),
  /** The computer's name, when the extension learned it from AkunMu Desktop on the same computer. */
  hostname: z.preprocess(blankToNull, z.string().trim().toLowerCase().max(253).regex(/^[a-z0-9][a-z0-9._-]*$/).nullish()),
  profile: z.object({
    name: z.string().trim().min(1).max(60),
    email: identifier,
    directory: z.preprocess(blankToNull, z.string().trim().max(120).nullish()),
  }),
  sessions: z.array(z.object({ domain, identifier })).max(300).default([]),
  /** Sites looked at: a recorded sign-in there that was not seen is marked for a check (never signed out). */
  checked: z.array(domain).max(400).default([]),
});

/** Accepting a finding; a sign-in found without its account needs the email or user name. */
export const acceptFindingSchema = z.object({ identifier });

/** Open a browser profile on this computer (desktop app), at a site: a recorded one, or one of the computer's own by its folder. */
export const openProfileSchema = z
  .object({
    profileId: z.number().int().positive().optional(),
    browser: z.enum(BROWSERS).optional(),
    directory: z.string().trim().min(1).max(120).optional(),
    url: z.preprocess(blankToNull, z.url({ protocol: /^https?$/ }).max(500).nullish()),
  })
  .refine((input) => input.profileId !== undefined || (input.browser !== undefined && input.directory !== undefined), {
    error: "validation.required",
    path: ["profileId"],
  });

export type IngestTokenInput = z.infer<typeof ingestTokenInputSchema>;
export type IngestReport = z.infer<typeof ingestReportSchema>;
export type AcceptFindingInput = z.infer<typeof acceptFindingSchema>;
