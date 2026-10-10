import { getDb, isUniqueViolation } from "../../shared/db";
import { conflict, notFound, validationError } from "../../shared/http/errors";
import type { Pagination } from "../../shared/http/request";
import { slugify } from "../../shared/text";
import { recordAudit } from "../audit/service";
import { restoreSignInsWhere, signInRows, softDeleteSignInsWhere } from "../signins/repository";
import { staleBefore } from "../signins/types";
import {
  countAccountsOfProvider,
  findAccountById,
  findAccountByIdentifier,
  findProviderById,
  insertAccount,
  insertProviders,
  listAccounts,
  listProviders,
  providerSlugs,
  updateAccount as updateAccountRow,
  updateProvider as updateProviderRow,
} from "./repository";
import type { AccountRecord, ProviderRecord } from "./schema";
import { BUILT_IN_PROVIDERS } from "./types";
import type { AccountInput, AccountUpdateInput, ProviderInput, ProviderUpdateInput } from "./validation";

// ----- providers -----

/** Adds the built-in providers a workspace does not have yet (new workspaces, and new built-ins later). */
export async function seedBuiltInProviders(): Promise<number> {
  const existing = await providerSlugs();
  const missing = BUILT_IN_PROVIDERS.filter((provider) => !existing.has(provider.slug));
  const inserted = await insertProviders(missing.map((provider) => ({ ...provider, builtIn: true })));
  return inserted.length;
}

export function providerView(provider: ProviderRecord) {
  return { id: provider.id, slug: provider.slug, name: provider.name, domain: provider.domain, color: provider.color, builtIn: provider.builtIn };
}

export async function listProvidersView(options: { trashed?: boolean } = {}) {
  const rows = await listProviders(options);
  return rows.map(({ provider, accountCount }) => ({ ...providerView(provider), accountCount, deletedAt: provider.deletedAt?.toISOString() ?? null }));
}

export async function getProvider(id: number): Promise<ProviderRecord> {
  const provider = await findProviderById(id);
  if (!provider) throw notFound();
  return provider;
}

export async function createProvider(input: ProviderInput, actorId: number) {
  const taken = await providerSlugs();
  const base = slugify(input.name, 40) || "provider";
  let slug = base;
  for (let suffix = 2; taken.has(slug); suffix += 1) slug = `${base}-${suffix}`;
  const [provider] = await insertProviders([{ slug, name: input.name, domain: input.domain ?? null, color: input.color, builtIn: false }]);
  if (!provider) throw validationError("name", "validation.providerExists");
  await recordAudit({ actorType: "staff", actorId, action: "provider.created", subjectType: "provider", subjectId: provider.id });
  return providerView(provider);
}

export async function updateProvider(id: number, input: ProviderUpdateInput, actorId: number) {
  await getProvider(id);
  const updated = await updateProviderRow(id, { ...input, domain: input.domain === undefined ? undefined : (input.domain ?? null) });
  await recordAudit({ actorType: "staff", actorId, action: "provider.updated", subjectType: "provider", subjectId: id });
  return providerView(updated);
}

/** Only providers without accounts can be removed (accounts keep their provider). */
export async function deleteProvider(id: number, actorId: number) {
  await getProvider(id);
  if ((await countAccountsOfProvider(id)) > 0) throw conflict("errors.providerInUse");
  await updateProviderRow(id, { deletedAt: new Date() });
  await recordAudit({ actorType: "staff", actorId, action: "provider.deleted", subjectType: "provider", subjectId: id });
}

export async function restoreProvider(id: number, actorId: number) {
  const provider = await findProviderById(id, { withTrashed: true });
  if (!provider?.deletedAt) throw notFound();
  if ((await providerSlugs()).has(provider.slug)) throw validationError("name", "validation.providerExists");
  let restored: ProviderRecord;
  try {
    restored = await updateProviderRow(id, { deletedAt: null });
  } catch (error) {
    if (isUniqueViolation(error)) throw validationError("name", "validation.providerExists");
    throw error;
  }
  await recordAudit({ actorType: "staff", actorId, action: "provider.restored", subjectType: "provider", subjectId: id });
  return providerView(restored);
}

// ----- accounts -----

export async function getAccount(id: number): Promise<AccountRecord> {
  const account = await findAccountById(id);
  if (!account) throw notFound();
  return account;
}

export async function listAccountsView(query: { search?: string; providerId?: number; trashed?: boolean } & Pagination) {
  const { items, total } = await listAccounts(query);
  return {
    items: items.map(({ account, provider, activeSignIns }) => ({
      id: account.id,
      identifier: account.identifier,
      label: account.label,
      twoFactor: account.twoFactor,
      provider: providerView(provider),
      activeSignIns,
      deletedAt: account.deletedAt?.toISOString() ?? null,
    })),
    total,
  };
}

/** An account with every place it is signed in, and where it was signed out. */
export async function accountDetail(id: number) {
  const account = await getAccount(id);
  const provider = await getProvider(account.providerId);
  const rows = await signInRows({ accountId: account.id, includeSignedOut: true });
  return {
    id: account.id,
    identifier: account.identifier,
    label: account.label,
    twoFactor: account.twoFactor,
    notes: account.notes,
    provider: providerView(provider),
    signIns: rows,
    staleBefore: staleBefore().toISOString(),
  };
}

async function assertIdentifierFree(providerId: number, identifier: string, exceptId?: number) {
  const existing = await findAccountByIdentifier(providerId, identifier);
  if (existing && existing.id !== exceptId) throw validationError("identifier", "validation.accountExists");
}

export async function createAccount(input: AccountInput, actorId: number) {
  await getProvider(input.providerId);
  await assertIdentifierFree(input.providerId, input.identifier);
  try {
    const account = await insertAccount({
      providerId: input.providerId,
      identifier: input.identifier,
      label: input.label ?? null,
      twoFactor: input.twoFactor,
      notes: input.notes ?? null,
      createdBy: actorId,
    });
    await recordAudit({ actorType: "staff", actorId, action: "account.created", subjectType: "account", subjectId: account.id });
    return account;
  } catch (error) {
    if (isUniqueViolation(error)) throw validationError("identifier", "validation.accountExists");
    throw error;
  }
}

/** The account with this identifier at the provider, created when the workspace does not have it yet. */
export async function findOrCreateAccount(providerId: number, identifier: string, actorId: number): Promise<{ account: AccountRecord; created: boolean }> {
  const existing = await findAccountByIdentifier(providerId, identifier.trim());
  if (existing) return { account: existing, created: false };
  return { account: await createAccount({ providerId, identifier, label: null, twoFactor: "unknown", notes: null }, actorId), created: true };
}

export async function updateAccount(id: number, input: AccountUpdateInput, actorId: number) {
  const account = await getAccount(id);
  const providerId = input.providerId ?? account.providerId;
  if (input.providerId !== undefined) await getProvider(input.providerId);
  if (input.identifier !== undefined || input.providerId !== undefined) await assertIdentifierFree(providerId, input.identifier ?? account.identifier, id);
  const updated = await updateAccountRow(id, {
    providerId,
    ...(input.identifier !== undefined ? { identifier: input.identifier } : {}),
    ...(input.label !== undefined ? { label: input.label ?? null } : {}),
    ...(input.twoFactor !== undefined ? { twoFactor: input.twoFactor } : {}),
    ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
  });
  await recordAudit({ actorType: "staff", actorId, action: "account.updated", subjectType: "account", subjectId: id, meta: { fields: Object.keys(input) } });
  return updated;
}

/** Moves an account to the trash with its sign-ins. */
export async function deleteAccount(id: number, actorId: number) {
  await getAccount(id);
  const deletedAt = new Date();
  await getDb().transaction(async (tx) => {
    await updateAccountRow(id, { deletedAt }, tx);
    await softDeleteSignInsWhere({ accountId: id }, deletedAt, tx);
  });
  await recordAudit({ actorType: "staff", actorId, action: "account.deleted", subjectType: "account", subjectId: id });
}

/** Restores an account with the sign-ins that went to the trash with it. */
export async function restoreAccount(id: number, actorId: number) {
  const account = await findAccountById(id, { withTrashed: true });
  if (!account?.deletedAt) throw notFound();
  await assertIdentifierFree(account.providerId, account.identifier, id);
  const deletedAt = account.deletedAt;
  const restored = await getDb().transaction(async (tx) => {
    const row = await updateAccountRow(id, { deletedAt: null }, tx);
    await restoreSignInsWhere({ accountId: id }, deletedAt, tx);
    return row;
  });
  await recordAudit({ actorType: "staff", actorId, action: "account.restored", subjectType: "account", subjectId: id });
  return restored;
}
