import { z } from "zod";
import { isLocale } from "../../shared/i18n/locales";
import { STAFF_ROLES } from "./schema";

export const PASSWORD_MIN_LENGTH = 10;

const email = z.email({ error: "validation.email" }).max(200).transform((value) => value.trim().toLowerCase());
const locale = z.string().refine(isLocale, { error: "validation.choice" });

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(200),
});

export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email,
  role: z.enum(STAFF_ROLES),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(200),
  locale: locale.nullish(),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: email.optional(),
  role: z.enum(STAFF_ROLES).optional(),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(200).optional(),
  locale: locale.nullish(),
  isActive: z.boolean().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
