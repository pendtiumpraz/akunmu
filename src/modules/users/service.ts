import bcrypt from "bcryptjs";
import { asPlatform, isUniqueViolation } from "../../shared/db";
import { AppError, conflict, notFound, unauthorized } from "../../shared/http/errors";
import type { Pagination } from "../../shared/http/request";
import { recordAudit } from "../audit/service";
import { findTenantById } from "../tenants/repository";
import { isServing } from "../tenants/status";
import {
  countActiveAdmins,
  findActiveUserByEmail,
  findUserById,
  insertUser,
  listUsers,
  restoreUser,
  revokeSessionsForUser,
  softDeleteUser,
  updateUser,
} from "./repository";
import type { User } from "./schema";
import type { CreateUserInput, UpdateUserInput } from "./validation";

const BCRYPT_COST = 12;

let timingDummyHash: Promise<string> | null = null;

/** Compared against when the email is unknown, so failed logins take the same time either way. */
function dummyHash(): Promise<string> {
  timingDummyHash ??= bcrypt.hash("timing-equalizer", BCRYPT_COST);
  return timingDummyHash;
}

export type PublicUser = Omit<User, "passwordHash">;

export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

/** Emails are unique across the platform, so sign-in (before any tenant is known) looks users up there. */
export function findStaffByEmailAnywhere(email: string) {
  return asPlatform(() => findActiveUserByEmail(email));
}

export async function authenticateStaff(email: string, password: string): Promise<User> {
  const user = await findStaffByEmailAnywhere(email);
  const matches = await bcrypt.compare(password, user?.passwordHash ?? (await dummyHash()));
  if (!user || !matches || !user.isActive) throw unauthorized("errors.invalidCredentials");
  if (user.tenantId !== null && !isServing(await asPlatform(() => findTenantById(user.tenantId as number)))) throw unauthorized("errors.tenantInactive");
  await asPlatform(() => updateUser(user.id, { lastLoginAt: new Date() }));
  return user;
}

export async function listStaff(query: { search?: string; trashed?: boolean } & Pagination) {
  const { items, total } = await listUsers(query);
  return { items: items.map(toPublicUser), total };
}

export async function getStaff(id: number): Promise<PublicUser> {
  const user = await findUserById(id);
  if (!user) throw notFound();
  return toPublicUser(user);
}

export async function createStaff(input: CreateUserInput, actorId: number | null): Promise<PublicUser> {
  if (await findStaffByEmailAnywhere(input.email)) throw conflict("errors.emailTaken");
  try {
    const user = await insertUser({
      name: input.name,
      email: input.email,
      role: input.role,
      locale: input.locale ?? null,
      passwordHash: await hashPassword(input.password),
    });
    await recordAudit({ actorType: actorId ? "staff" : "system", actorId, action: "user.created", subjectType: "user", subjectId: user.id, meta: { role: user.role } });
    return toPublicUser(user);
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict("errors.emailTaken");
    throw error;
  }
}

export async function updateStaff(id: number, input: UpdateUserInput, actorId: number): Promise<PublicUser> {
  const user = await findUserById(id);
  if (!user) throw notFound();
  if (input.email && input.email !== user.email.toLowerCase()) {
    const other = await findStaffByEmailAnywhere(input.email);
    if (other && other.id !== id) throw conflict("errors.emailTaken");
  }
  const losesAdmin =
    user.role === "admin" && ((input.role !== undefined && input.role !== "admin") || input.isActive === false);
  if (losesAdmin && (await countActiveAdmins()) <= 1) throw new AppError(409, "errors.lastAdmin");

  const updated = await updateUser(id, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.role !== undefined ? { role: input.role } : {}),
    ...(input.locale !== undefined ? { locale: input.locale } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
  });
  if (!updated) throw notFound();
  if (input.password || input.isActive === false || (input.role && input.role !== user.role)) {
    await asPlatform(() => revokeSessionsForUser(id));
  }
  await recordAudit({ actorType: "staff", actorId, action: "user.updated", subjectType: "user", subjectId: id, meta: { fields: Object.keys(input).filter((key) => key !== "password") } });
  return toPublicUser(updated);
}

export async function deleteStaff(id: number, actorId: number): Promise<PublicUser> {
  if (id === actorId) throw new AppError(409, "errors.cannotDeleteSelf");
  const user = await findUserById(id);
  if (!user) throw notFound();
  if (user.role === "admin" && (await countActiveAdmins()) <= 1) throw new AppError(409, "errors.lastAdmin");
  const deleted = await softDeleteUser(id);
  if (!deleted) throw notFound();
  await asPlatform(() => revokeSessionsForUser(id));
  await recordAudit({ actorType: "staff", actorId, action: "user.deleted", subjectType: "user", subjectId: id });
  return toPublicUser(deleted);
}

export async function restoreStaff(id: number, actorId: number): Promise<PublicUser> {
  const user = await findUserById(id, { withTrashed: true });
  if (!user || !user.deletedAt) throw notFound();
  if (await findStaffByEmailAnywhere(user.email)) throw conflict("errors.emailTaken");
  const restored = await restoreUser(id);
  if (!restored) throw notFound();
  await recordAudit({ actorType: "staff", actorId, action: "user.restored", subjectType: "user", subjectId: id });
  return toPublicUser(restored);
}

/** A platform staff account (no tenant); tenant staff are not found here. Platform scope only. */
export async function getPlatformStaff(id: number, options: { withTrashed?: boolean } = {}): Promise<PublicUser> {
  const user = await findUserById(id, options);
  if (!user || user.tenantId !== null) throw notFound();
  return toPublicUser(user);
}
