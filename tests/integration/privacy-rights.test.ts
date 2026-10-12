import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { insertConversation, insertMessage } from "@/modules/ai/conversations";
import { aiConversations } from "@/modules/ai/schema";
import { devices } from "@/modules/devices/schema";
import { consentState, recordConsent, updateConsent } from "@/modules/privacy/consents";
import { deleteMyAccount, deleteWorkspace, exportMyData } from "@/modules/privacy/my-data";
import { deleteRequest, fileUserRequest, listRequests, recordStaffRequest, requestsOfUser, respondToRequest } from "@/modules/privacy/requests";
import { accountConsents, privacyRequests } from "@/modules/privacy/schema";
import { POLICY_VERSION } from "@/modules/privacy/types";
import { signupSchema } from "@/modules/tenants/validation";
import { tenants } from "@/modules/tenants/schema";
import { users } from "@/modules/users/schema";
import { asPlatform, inTenant } from "@/shared/db";
import { createTestTenant, openTestDatabase, type TestDatabase } from "../helpers/database";
import { device, signIn, staffUser } from "../helpers/fixtures";

let database: TestDatabase;

beforeEach(async () => {
  database = await openTestDatabase();
});

afterEach(async () => {
  await database.close();
});

describe("consent", () => {
  it("requires accepting the terms at sign-up and keeps product news a separate choice", () => {
    const base = { workspace: "My laptops", name: "Owner", email: "owner@example.com", password: "correct-horse-battery" };
    expect(signupSchema.safeParse(base).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, acceptTerms: false }).success).toBe(false);
    expect(signupSchema.parse({ ...base, acceptTerms: true })).toMatchObject({ acceptTerms: true, marketing: false });
  });

  it("records proof of consent, asks again when the policy changes and lets the user withdraw product news", async () => {
    const admin = await staffUser();
    expect((await consentState(admin.id)).needsAcceptance).toBe(true);
    await recordConsent({ userId: admin.id, tenantId: database.tenantId, marketing: true, source: "signup" });
    const accepted = await consentState(admin.id);
    expect(accepted).toMatchObject({ needsAcceptance: false, acceptedVersion: POLICY_VERSION, marketing: true });

    const withdrawn = await updateConsent(admin.id, database.tenantId, false);
    expect(withdrawn.marketing).toBe(false);
    expect(withdrawn.history).toHaveLength(2);

    await database.owner.update(accountConsents).set({ policyVersion: "2020-01-01" }).where(eq(accountConsents.userId, admin.id));
    expect((await consentState(admin.id)).needsAcceptance).toBe(true);
    // Consent records are platform data: a workspace scope never sees them.
    expect(await database.db.select().from(accountConsents)).toHaveLength(0);
  });
});

describe("data subject requests", () => {
  it("routes requests to the workspace or the operator with a 3 x 24 hour deadline", async () => {
    const admin = await staffUser();
    const editor = await staffUser("editor");
    const toWorkspace = await fileUserRequest(editor, database.tenantId, { recipient: "workspace", requestType: "deletion", description: "Remove my work laptop" });
    const toPlatform = await fileUserRequest(editor, database.tenantId, { recipient: "platform", requestType: "access" });
    expect(toWorkspace.tenantId).toBe(database.tenantId);
    expect(toPlatform.tenantId).toBeNull();
    expect(toWorkspace.deadlineAt.getTime() - toWorkspace.createdAt.getTime()).toBeGreaterThan(71 * 3_600_000);
    expect(toWorkspace.code).toMatch(/^DSR-\d{8}-[0-9A-Z]{5}$/);

    expect((await listRequests(database.tenantId, { page: 1, perPage: 10 })).total).toBe(1);
    await asPlatform(async () => expect((await listRequests(null, { page: 1, perPage: 10 })).total).toBe(1));
    expect(await requestsOfUser(editor.id, database.tenantId)).toHaveLength(2);

    await expect(deleteRequest(database.tenantId, toWorkspace.id, admin.id)).rejects.toMatchObject({ status: 409, messageKey: "errors.requestStillOpen" });
    const answered = await respondToRequest(database.tenantId, toWorkspace.id, { status: "completed", response: "The laptop was removed from the map." }, admin.id);
    expect(answered.closedAt).not.toBeNull();
    await deleteRequest(database.tenantId, toWorkspace.id, admin.id);

    const other = await createTestTenant(database.owner, "workspace-b");
    await inTenant(other, async () => {
      expect((await listRequests(other, { page: 1, perPage: 10 })).total).toBe(0);
      await expect(respondToRequest(other, toWorkspace.id, { status: "rejected", response: "" }, admin.id)).rejects.toMatchObject({ status: 404 });
    });
  });

  it("lets staff record a request received by email", async () => {
    const admin = await staffUser();
    const row = await recordStaffRequest(database.tenantId, { requesterName: "Former member", requesterEmail: "Former@Example.com", requestType: "access" }, admin.id);
    expect(row).toMatchObject({ channel: "staff", requesterEmail: "former@example.com", requesterUserId: null });
  });
});

describe("my data", () => {
  it("exports the user's account, consent, requests, own conversations and the readable map", async () => {
    const admin = await staffUser();
    const viewer = await staffUser("viewer");
    const laptop = await device(admin.id);
    await signIn(admin.id, { deviceId: laptop.id }, { provider: "google", identifier: "owner@example.com" });
    await recordConsent({ userId: viewer.id, tenantId: database.tenantId, marketing: false, source: "settings" });
    await fileUserRequest(viewer, database.tenantId, { recipient: "platform", requestType: "portability" });
    const mine = await insertConversation({ userId: viewer.id, title: "Where is my laptop signed in?", model: null });
    await insertMessage({ conversationId: mine.id, role: "user", content: "Where is my laptop signed in?" });
    await insertConversation({ userId: admin.id, title: "Not for the viewer", model: null });

    const data = await exportMyData(viewer, database.tenantId);
    expect(data.account.email).toBe(viewer.email);
    expect(data.account).not.toHaveProperty("passwordHash");
    expect(data.consent.acceptedVersion).toBe(POLICY_VERSION);
    expect(data.privacyRequests).toEqual([expect.objectContaining({ recipient: "platform", requestType: "portability" })]);
    expect(data.assistantConversations).toHaveLength(1);
    expect(data.assistantConversations[0].messages[0].content).toContain("laptop");
    expect(data.map.devices).toHaveLength(1);
    expect(data.map.accounts[0].identifier).toBe("owner@example.com");
  });

  it("erases the user's own account but keeps the workspace's map, and protects the last admin", async () => {
    const admin = await staffUser();
    const editor = await staffUser("editor");
    const laptop = await device(editor.id);
    const chat = await insertConversation({ userId: editor.id, title: "Mine", model: null });
    await recordConsent({ userId: editor.id, tenantId: database.tenantId, marketing: true, source: "signup" });

    await expect(deleteMyAccount(admin, database.tenantId, admin.email)).rejects.toMatchObject({ status: 409, messageKey: "errors.lastAdminDeleteWorkspace" });
    await expect(deleteMyAccount(editor, database.tenantId, "someone-else@example.com")).rejects.toMatchObject({ status: 422 });
    await deleteMyAccount(editor, database.tenantId, editor.email.toUpperCase());

    expect(await database.owner.select().from(users).where(eq(users.id, editor.id))).toHaveLength(0);
    expect(await database.owner.select().from(aiConversations).where(eq(aiConversations.id, chat.id))).toHaveLength(0);
    expect(await database.owner.select().from(accountConsents).where(eq(accountConsents.userId, editor.id))).toHaveLength(0);
    expect(await database.owner.select().from(devices).where(eq(devices.id, laptop.id))).toHaveLength(1);
  });

  it("erases a whole workspace in one go and leaves other workspaces alone", async () => {
    const admin = await staffUser();
    const laptop = await device(admin.id);
    await signIn(admin.id, { deviceId: laptop.id }, { provider: "google", identifier: "owner@example.com" });
    await fileUserRequest(admin, database.tenantId, { recipient: "workspace", requestType: "access" });
    await fileUserRequest(admin, database.tenantId, { recipient: "platform", requestType: "access" });
    const other = await createTestTenant(database.owner, "workspace-b");
    const otherDevice = await inTenant(other, async () => device((await staffUser()).id));

    const editor = await staffUser("editor");
    await expect(deleteWorkspace(editor, database.tenantId, "test")).rejects.toMatchObject({ status: 403 });
    await expect(deleteWorkspace(admin, database.tenantId, "wrong")).rejects.toMatchObject({ status: 422 });
    await deleteWorkspace(admin, database.tenantId, "TEST");

    expect(await database.owner.select().from(tenants).where(eq(tenants.id, database.tenantId))).toHaveLength(0);
    expect(await database.owner.select().from(users).where(eq(users.tenantId, database.tenantId))).toHaveLength(0);
    expect(await database.owner.select().from(devices).where(eq(devices.tenantId, database.tenantId))).toHaveLength(0);
    expect(await database.owner.select().from(privacyRequests).where(eq(privacyRequests.tenantId, database.tenantId))).toHaveLength(0);
    // The request to the operator is the operator's record of how it was handled.
    expect(await database.owner.select().from(privacyRequests)).toHaveLength(1);
    expect(await database.owner.select().from(devices).where(eq(devices.id, otherDevice.id))).toHaveLength(1);
  });
});
