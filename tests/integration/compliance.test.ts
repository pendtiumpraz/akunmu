import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDpia, deleteDpia, listDpia, restoreDpia, updateDpia } from "@/modules/compliance/dpia";
import { buildDpiaDocument, buildIncidentDocument, buildRegisterDocument, buildRopaDocument } from "@/modules/compliance/documents";
import { createIncident, listIncidents, overdueIncidents, updateIncident } from "@/modules/compliance/incidents";
import { saveRetentionPolicy } from "@/modules/compliance/profile";
import { runPlatformRetention, runTenantRetention } from "@/modules/compliance/retention";
import {
  createCustomRopa,
  deleteCustomRopa,
  getRopa,
  listRopa,
  loadRopaContext,
  resetRopa,
  restoreCustomRopa,
  updateRopa,
} from "@/modules/compliance/ropa";
import { consumeRateLimit } from "@/modules/security/rate-limit";
import { signIns } from "@/modules/signins/schema";
import { signOut } from "@/modules/signins/service";
import { renderDocumentDocx } from "@/server/documents/docx";
import { renderDocumentPdf } from "@/server/documents/pdf";
import { asPlatform, inTenant } from "@/shared/db";
import { AppError } from "@/shared/http/errors";
import { createTestTenant, openTestDatabase, type TestDatabase } from "../helpers/database";
import { device, signIn, staffUser } from "../helpers/fixtures";

let database: TestDatabase;

beforeEach(async () => {
  database = await openTestDatabase();
});

afterEach(async () => {
  await database.close();
});

const frame = { accent: "#0f766e", product: "AkunMu", now: new Date("2026-10-12T07:00:00Z") };

const NO_DETAILS = { description: "", cause: "", dataCategories: "", consequences: "", measures: "", notificationNote: "", reporterName: "", activityKeys: [] };

function incidentInput(overrides: Record<string, unknown> = {}) {
  return {
    title: "Workspace key shared in a chat",
    severity: "high" as const,
    status: "open" as const,
    occurredAt: null,
    discoveredAt: new Date(),
    containedAt: null,
    subjectsNotifiedAt: null,
    authorityNotifiedAt: null,
    publicNotifiedAt: null,
    closedAt: null,
    affectedCount: null,
    details: NO_DETAILS,
    ...overrides,
  };
}

describe("records of processing activities", () => {
  it("lists the workspace catalog with live counts and flags unset retention periods", async () => {
    const admin = await staffUser();
    const laptop = await device(admin.id);
    await signIn(admin.id, { deviceId: laptop.id }, { provider: "google", identifier: "owner@example.com" });
    const context = await loadRopaContext("tenant", "en");
    const views = await listRopa(context);
    expect(views.map((view) => view.key)).toEqual(["devices", "accounts", "signins", "connect", "assistant", "requests"]);
    const devices = views.find((view) => view.key === "devices");
    expect(devices?.code).toBe("RoPA-DEV");
    expect(devices?.inUse).toBe(true);
    expect(devices?.stats[0]).toMatchObject({ key: "devices", total: 1, recent: 1 });
    const signins = views.find((view) => view.key === "signins");
    expect(signins?.missing).toContain("retention");
    expect(signins?.dpiaRequired).toBe(true);
    expect(views.find((view) => view.key === "requests")?.dpiaRequired).toBe(false);
  });

  it("keeps corrections per language, bumps the version and resets to the catalog", async () => {
    const admin = await staffUser();
    const context = await loadRopaContext("tenant", "id");
    await updateRopa(context, "accounts", { overrides: { purpose: { id: "Custom purpose (id)", en: "Custom purpose" } }, assignment: { picName: "Dewi" } }, admin.id);
    const updated = await updateRopa(context, "accounts", { overrides: { notes: { id: "A note" } } }, admin.id);
    expect(updated.fields.purpose.value).toBe("Custom purpose (id)");
    expect(updated.assignment.picName).toBe("Dewi");
    expect(updated.version).toBe(2);
    expect((await getRopa(await loadRopaContext("tenant", "en"), "accounts")).fields.purpose.value).toBe("Custom purpose");

    const reset = await resetRopa(context, "accounts", admin.id);
    expect(reset.fields.purpose.value).toBe(reset.fields.purpose.defaultValue);
    expect(reset.assignment.picName).toBe("");
  });

  it("adds, trashes and restores custom activities, but never deletes catalog ones", async () => {
    const admin = await staffUser();
    const context = await loadRopaContext("tenant", "id");
    const custom = await createCustomRopa(context, { name: { en: "Paper list of office laptops" } }, admin.id);
    expect(custom.code).toBe("RoPA-X01");
    expect(custom.kind).toBe("custom");
    expect(custom.missing).toContain("purpose");
    await deleteCustomRopa(context, custom.key, admin.id);
    expect((await listRopa(context)).some((view) => view.key === custom.key)).toBe(false);
    await restoreCustomRopa(context, custom.key, admin.id);
    expect((await listRopa(context)).some((view) => view.key === custom.key)).toBe(true);
    await expect(deleteCustomRopa(context, "devices", admin.id)).rejects.toBeInstanceOf(AppError);
  });

  it("keeps workspace records apart from each other and from the platform's own register", async () => {
    const admin = await staffUser();
    const context = await loadRopaContext("tenant", "id");
    await updateRopa(context, "devices", { overrides: { notes: { id: "Owned by workspace A" } } }, admin.id);
    const other = await createTestTenant(database.owner, "workspace-b");
    await inTenant(other, async () => {
      const view = await getRopa(await loadRopaContext("tenant", "id"), "devices");
      expect(view.fields.notes.value).toBe("");
    });
    await asPlatform(async () => {
      const platform = await loadRopaContext("platform", "id");
      const views = await listRopa(platform);
      expect(views.filter((view) => view.kind === "catalog").map((view) => view.key)).toEqual(["platform-accounts", "platform-signup", "platform-security", "platform-ai"]);
      expect(views.filter((view) => view.kind === "processor")).toHaveLength(6);
      const processor = views.find((view) => view.key === "processor:devices");
      expect(processor?.code).toBe("RoPA-PRS-DEV");
      expect(processor?.fields.notes.value).toBe("");
      await expect(getRopa(platform, "devices")).rejects.toBeInstanceOf(AppError);
    });
  });
});

describe("data protection impact assessments", () => {
  it("starts from the RoPA criteria and catalog risks, scores them and gets approved", async () => {
    const admin = await staffUser();
    const context = await loadRopaContext("tenant", "id");
    const dpia = await createDpia(context, "connect", admin.id, admin.name);
    expect(dpia.code).toBe("DPIA-EXT");
    expect(dpia.threshold.systematic_evaluation.answer).toBe("yes");
    expect(dpia.required).toBe(true);
    expect(dpia.risks).toHaveLength(4);
    expect(dpia.summary.overall).not.toBeNull();
    await expect(createDpia(context, "connect", admin.id, admin.name)).rejects.toMatchObject({ status: 409 });

    const risks = dpia.risks.map((risk) => ({
      id: risk.id,
      templateId: risk.templateId,
      category: risk.category,
      event: {},
      mitigation: {},
      impact: risk.impact,
      likelihood: risk.likelihood,
      control: 3,
      treatment: risk.treatment,
    }));
    const approved = await updateDpia(context, "connect", { risks, status: "approved", decision: "proceed", signoff: { dpoName: "Dewi", dpoReviewedAt: "2026-10-12" } }, admin.id);
    expect(approved.status).toBe("approved");
    expect(approved.approvedAt).not.toBeNull();
    expect(approved.summary.toMitigate).toBe(0);
    expect((await getRopa(context, "connect")).dpia?.status).toBe("approved");

    await deleteDpia(context, "connect", admin.id);
    expect(await listDpia(context)).toHaveLength(0);
    expect((await restoreDpia(context, "connect", admin.id)).status).toBe("approved");
  });

  it("refuses a DPIA for a processor record", async () => {
    const admin = await staffUser();
    await asPlatform(async () => {
      const platform = await loadRopaContext("platform", "id");
      await expect(createDpia(platform, "processor:devices", admin.id, admin.name)).rejects.toBeInstanceOf(AppError);
      expect((await createDpia(platform, "platform-ai", admin.id, admin.name)).code).toBe("DPIA-AIG");
    });
  });
});

describe("breach register", () => {
  it("numbers incidents per year, tracks the 3 x 24 hour deadline and validates the timeline", async () => {
    const admin = await staffUser();
    const discoveredAt = new Date(Date.now() - 80 * 3_600_000);
    const incident = await createIncident(database.tenantId, incidentInput({ discoveredAt, affectedCount: 12, details: { ...NO_DETAILS, dataCategories: "Account identifiers", activityKeys: ["accounts"] } }), admin.id);
    expect(incident.code).toBe(`INC-${discoveredAt.getUTCFullYear()}-001`);
    expect(incident.noticeDeadlineAt.getTime() - discoveredAt.getTime()).toBe(72 * 3_600_000);
    expect(incident.overdue).toBe(true);
    expect(await overdueIncidents(database.tenantId)).toBe(1);

    const notified = await updateIncident(database.tenantId, incident.id, { subjectsNotifiedAt: new Date(), authorityNotifiedAt: new Date(), status: "notified" }, admin.id);
    expect(notified.hoursLeft).toBeNull();
    expect(await overdueIncidents(database.tenantId)).toBe(0);
    await expect(updateIncident(database.tenantId, incident.id, { occurredAt: new Date() }, admin.id)).rejects.toBeInstanceOf(AppError);
    expect((await listIncidents(database.tenantId, { page: 1, perPage: 10 })).total).toBe(1);
    await asPlatform(async () => expect((await listIncidents(null, { page: 1, perPage: 10 })).total).toBe(0));
  });
});

describe("retention", () => {
  it("does nothing until a period is set, then deletes places signed out long ago", async () => {
    const admin = await staffUser();
    const laptop = await device(admin.id);
    const row = await signIn(admin.id, { deviceId: laptop.id }, { provider: "github", identifier: "octo-owner" });
    await signOut(row.id, admin.id);
    await database.owner.update(signIns).set({ signedOutAt: new Date(Date.now() - 90 * 86_400_000) }).where(eq(signIns.id, row.id));
    expect((await runTenantRetention()).signInsDeleted).toBe(0);
    await saveRetentionPolicy({ findingDays: null, signedOutDays: 30, aiDays: null, auditDays: null }, admin.id);
    expect((await runTenantRetention()).signInsDeleted).toBe(1);
    const view = await getRopa(await loadRopaContext("tenant", "en"), "signins");
    expect(view.missing).not.toContain("retention");
    expect(String(view.fields.retention.value)).toContain("30 days");
  });

  it("purges expired attempt counters in the platform scope", async () => {
    await consumeRateLimit("login-ip:203.0.113.9", 5, 1);
    await asPlatform(async () => {
      const result = await runPlatformRetention(new Date(Date.now() + 2 * 86_400_000));
      expect(result.rateLimitsDeleted).toBe(1);
    });
  });
});

describe("documents", () => {
  it("renders RoPA, DPIA, incident and register documents as PDF and Word", async () => {
    const admin = await staffUser();
    const context = await loadRopaContext("tenant", "en");
    const ropa = await getRopa(context, "assistant");
    const ropaDocument = buildRopaDocument({ context, frame }, ropa);
    expect(ropaDocument.sections.map((section) => section.number).slice(0, 3)).toEqual(["I", "II", "III"]);
    expect(ropaDocument.sections.some((section) => section.subtitle?.includes("74(2)(j)"))).toBe(true);

    const dpia = await createDpia(context, "assistant", admin.id, admin.name);
    const dpiaDocument = buildDpiaDocument({ context, frame }, dpia, ropa);
    expect(dpiaDocument.code).toBe("DPIA-AIA");

    const incident = await createIncident(database.tenantId, incidentInput({ title: "Document test", severity: "low" }), admin.id);
    const documents = [ropaDocument, dpiaDocument, buildIncidentDocument({ context, frame }, incident, new Map()), buildRegisterDocument({ context, frame }, await listRopa(context))];
    for (const document of documents) {
      const pdf = await renderDocumentPdf(document);
      expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
      const docx = await renderDocumentDocx(document);
      expect(docx.subarray(0, 2).toString()).toBe("PK");
    }
  });
});
