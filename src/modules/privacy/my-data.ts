import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { asPlatform, db, type DbExecutor } from "../../shared/db";
import { AppError, forbidden } from "../../shared/http/errors";
import { accounts, providers } from "../accounts/schema";
import { aiActions, aiConversations, aiMessages, aiUsage } from "../ai/schema";
import { auditLogs } from "../audit/schema";
import { recordAudit } from "../audit/service";
import { dpiaAssessments, privacyIncidents, processingActivities } from "../compliance/schema";
import { findings, ingestTokens } from "../connect/schema";
import { browserProfiles, devices } from "../devices/schema";
import { appSettings } from "../settings/schema";
import { signIns } from "../signins/schema";
import { tenants } from "../tenants/schema";
import { getTenant } from "../tenants/service";
import { countActiveAdmins } from "../users/repository";
import { staffSessions, users, type User } from "../users/schema";
import { consentState } from "./consents";
import { requestsOfUser } from "./requests";
import { accountConsents, privacyRequests } from "./schema";

/**
 * Self-service rights of signed-in users (UU PDP Art. 7, 8, 9 and 13; PP 33/2026 Art. 76, 79 and 111):
 * a machine-readable copy of their data, erasure of their own account and, for the last admin, erasure of the
 * whole workspace. Erasure deletes the rows for good (no trash), after the user typed a confirmation.
 */

/** Map rows every member can read (map.read): the workspace's devices, profiles, providers, accounts and sign-ins. */
async function workspaceMap() {
  const [deviceRows, profileRows, providerRows, accountRows, signInRows] = await Promise.all([
    db().select().from(devices).where(isNull(devices.deletedAt)),
    db().select().from(browserProfiles).where(isNull(browserProfiles.deletedAt)),
    db().select().from(providers).where(and(isNull(providers.deletedAt), eq(providers.builtIn, false))),
    db().select().from(accounts).where(isNull(accounts.deletedAt)),
    db().select().from(signIns).where(isNull(signIns.deletedAt)),
  ]);
  return {
    devices: deviceRows.map(({ id, name, kind, system, location, hostname, notes, lastCheckedAt, createdAt }) => ({ id, name, kind, system, location, hostname, notes, lastCheckedAt, createdAt })),
    browserProfiles: profileRows.map(({ id, deviceId, browser, name, directory, syncAccountId, notes, createdAt }) => ({ id, deviceId, browser, name, directory, syncAccountId, notes, createdAt })),
    customProviders: providerRows.map(({ id, slug, name, domain }) => ({ id, slug, name, domain })),
    accounts: accountRows.map(({ id, providerId, identifier, label, twoFactor, notes, createdAt }) => ({ id, providerId, identifier, label, twoFactor, notes, createdAt })),
    signIns: signInRows.map(({ id, accountId, deviceId, profileId, app, appKind, approvedFromId, approvalMethod, status, since, lastVerifiedAt, signedOutAt, review, notes }) => ({
      id,
      accountId,
      deviceId,
      profileId,
      app,
      appKind,
      approvedFromId,
      approvalMethod,
      status,
      since,
      lastVerifiedAt,
      signedOutAt,
      review,
      notes,
    })),
  };
}

/** The user's own assistant chats with every message (nobody else in the workspace sees them). */
async function ownConversations(userId: number) {
  const conversations = await db()
    .select({ id: aiConversations.id, title: aiConversations.title, createdAt: aiConversations.createdAt, lastMessageAt: aiConversations.lastMessageAt })
    .from(aiConversations)
    .where(and(eq(aiConversations.userId, userId), isNull(aiConversations.deletedAt)))
    .orderBy(desc(aiConversations.lastMessageAt));
  if (conversations.length === 0) return [];
  const messages = await db()
    .select({ conversationId: aiMessages.conversationId, role: aiMessages.role, content: aiMessages.content, createdAt: aiMessages.createdAt })
    .from(aiMessages)
    .where(and(inArray(aiMessages.conversationId, conversations.map((conversation) => conversation.id)), isNull(aiMessages.deletedAt)))
    .orderBy(aiMessages.id);
  return conversations.map((conversation) => ({
    ...conversation,
    messages: messages.filter((message) => message.conversationId === conversation.id).map(({ role, content, createdAt }) => ({ role, content, createdAt })),
  }));
}

/** Everything about the signed-in user, plus the workspace map they can read, as one JSON document. */
export async function exportMyData(user: Omit<User, "passwordHash">, tenantId: number) {
  const workspace = await getTenant(tenantId);
  const map = await workspaceMap();
  const conversations = await ownConversations(user.id);
  const consent = await consentState(user.id);
  const requests = await requestsOfUser(user.id, tenantId);
  // Awaited inside the scope: a query builder only runs when awaited, and sessions are platform rows.
  const sessions = await asPlatform(async () =>
    await db()
      .select({ createdAt: staffSessions.createdAt, lastUsedAt: staffSessions.lastUsedAt, expiresAt: staffSessions.expiresAt, endedAt: staffSessions.deletedAt, userAgent: staffSessions.userAgent })
      .from(staffSessions)
      .where(eq(staffSessions.userId, user.id))
      .orderBy(desc(staffSessions.createdAt)),
  );
  await recordAudit({ actorType: "staff", actorId: user.id, action: "privacy.data_exported", subjectType: "user", subjectId: user.id });
  const { id, name, email, role, locale, createdAt, lastLoginAt } = user;
  return {
    format: "akunmu.my-data.v1",
    exportedAt: new Date().toISOString(),
    account: { id, name, email, role, locale, createdAt, lastLoginAt },
    workspace: { slug: workspace.slug, name: workspace.name, legalName: workspace.legalName, contactEmail: workspace.contactEmail },
    consent,
    sessions,
    privacyRequests: requests.map(({ code, tenantId: owner, requestType, status, description, response, deadlineAt, respondedAt, closedAt, createdAt: filedAt }) => ({
      code,
      recipient: owner === null ? "platform" : "workspace",
      requestType,
      status,
      description,
      response,
      deadlineAt,
      respondedAt,
      closedAt,
      createdAt: filedAt,
    })),
    assistantConversations: conversations,
    map,
  };
}

async function deleteConversations(executor: DbExecutor, conversationIds: number[]): Promise<void> {
  if (conversationIds.length === 0) return;
  await db(executor).delete(aiActions).where(inArray(aiActions.conversationId, conversationIds));
  await db(executor).delete(aiMessages).where(inArray(aiMessages.conversationId, conversationIds));
  await db(executor).delete(aiConversations).where(inArray(aiConversations.id, conversationIds));
}

/**
 * Erases the signed-in user's account: the user row, sessions, assistant chats and consent records are deleted.
 * Map rows stay with the workspace (its controller decides about them). The last admin deletes the workspace
 * instead, so a workspace is never left without anyone to answer for it. Requests the user filed stay with
 * whoever received them, as the record of how they were handled (UU PDP Art. 31).
 */
export async function deleteMyAccount(user: Pick<User, "id" | "email" | "role">, tenantId: number, confirmation: string): Promise<void> {
  if (confirmation.trim().toLowerCase() !== user.email.toLowerCase()) throw new AppError(422, "errors.confirmationMismatch");
  if (user.role === "admin" && (await countActiveAdmins()) <= 1) throw new AppError(409, "errors.lastAdminDeleteWorkspace");
  await asPlatform(async () =>
    await db().transaction(async (transaction) => {
      const conversations = await transaction
        .select({ id: aiConversations.id })
        .from(aiConversations)
        .where(and(eq(aiConversations.tenantId, tenantId), eq(aiConversations.userId, user.id)));
      await deleteConversations(transaction, conversations.map((row) => row.id));
      await transaction.delete(staffSessions).where(eq(staffSessions.userId, user.id));
      await transaction.delete(accountConsents).where(eq(accountConsents.userId, user.id));
      await transaction.delete(users).where(and(eq(users.id, user.id), eq(users.tenantId, tenantId)));
      // The entry keeps no personal data: only that account number N of workspace M was erased.
      await recordAudit({ actorType: "system", action: "user.erased_by_self", subjectType: "user", subjectId: user.id, meta: { tenantId } }, transaction);
    }),
  );
}

/**
 * Erases a whole workspace (admins only, after typing its address): every row the workspace owns is deleted —
 * map, extension keys and findings, assistant chats, settings, privacy records, audit log — and so are its
 * members with their sessions and consent records. Requests members filed with the operator stay with the
 * operator. Runs as one transaction, so it either erases everything or nothing.
 */
export async function deleteWorkspace(user: Pick<User, "role" | "tenantId">, tenantId: number, confirmation: string): Promise<void> {
  if (user.role !== "admin" || user.tenantId !== tenantId) throw forbidden();
  const workspace = await getTenant(tenantId);
  if (confirmation.trim().toLowerCase() !== workspace.slug.toLowerCase()) throw new AppError(422, "errors.confirmationMismatch");
  await asPlatform(async () =>
    await db().transaction(async (transaction) => {
      const owned = [
        findings,
        ingestTokens,
        signIns,
        accounts,
        providers,
        browserProfiles,
        devices,
        aiActions,
        aiMessages,
        aiConversations,
        aiUsage,
        appSettings,
        processingActivities,
        dpiaAssessments,
        privacyIncidents,
        privacyRequests,
        auditLogs,
      ] as const;
      for (const table of owned) await transaction.delete(table).where(eq(table.tenantId, tenantId));
      const members = await transaction.select({ id: users.id }).from(users).where(eq(users.tenantId, tenantId));
      const memberIds = members.map((member) => member.id);
      if (memberIds.length > 0) {
        await transaction.delete(staffSessions).where(inArray(staffSessions.userId, memberIds));
        await transaction.delete(accountConsents).where(inArray(accountConsents.userId, memberIds));
        await transaction.delete(users).where(eq(users.tenantId, tenantId));
      }
      await transaction.delete(tenants).where(eq(tenants.id, tenantId));
      await recordAudit({ actorType: "system", action: "tenant.erased_by_admin", subjectType: "tenant", subjectId: tenantId, meta: { members: memberIds.length } }, transaction);
    }),
  );
}
