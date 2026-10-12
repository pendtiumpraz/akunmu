import { INFRASTRUCTURE, LOCAL_INFRASTRUCTURE } from "@/modules/compliance/catalog";
import { describeInfrastructure } from "@/modules/compliance/hosting";
import { createDpia, deleteDpia, dpiaUpdateSchema, getDpia, listDpia, restoreDpia, updateDpia } from "@/modules/compliance/dpia";
import { activityNameMap, buildDpiaDocument, buildIncidentDocument, buildRegisterDocument, buildRopaDocument, type DocumentFrame } from "@/modules/compliance/documents";
import {
  createIncident,
  deleteIncident,
  getIncident,
  incidentInputSchema,
  incidentUpdateSchema,
  listIncidents,
  overdueIncidents,
  restoreIncident,
  updateIncident,
} from "@/modules/compliance/incidents";
import { loadPrivacyProfile, loadRetentionPolicy, privacyProfileInputSchema, retentionInputSchema, savePrivacyProfile, saveRetentionPolicy } from "@/modules/compliance/profile";
import {
  createCustomRopa,
  deleteCustomRopa,
  getRopa,
  listRopa,
  listTrashedRopa,
  loadRopaContext,
  resetRopa,
  restoreCustomRopa,
  ropaCreateSchema,
  ropaUpdateSchema,
  updateRopa,
  type ComplianceScope,
  type RopaContext,
} from "@/modules/compliance/ropa";
import { countOpenRequests, deleteRequest, listRequests, recordStaffRequest, respondToRequest, responseSchema, restoreRequest, staffRequestSchema } from "@/modules/privacy/requests";
import type { Permission } from "@/modules/users/permissions";
import { can } from "@/modules/users/permissions";
import type { StaffContext } from "@/modules/users/session";
import { renderDocumentDocx } from "@/server/documents/docx";
import { DOCUMENT_TYPES, isDocumentFormat, type ComplianceDocument } from "@/server/documents/model";
import { renderDocumentPdf } from "@/server/documents/pdf";
import { asPlatform } from "@/shared/db";
import { badRequest, forbidden } from "@/shared/http/errors";
import { paginated, parseId, readJson, readPagination } from "@/shared/http/request";
import { created, ok } from "@/shared/http/respond";
import { parseWith } from "@/shared/http/validation";
import { isLocale, type Locale } from "@/shared/i18n/locales";
import type { I18n } from "@/shared/i18n/messages-loader";
import { platformRoute, staffRoute } from "../route";

/**
 * Route handlers for the privacy compliance area, shared by workspace admins (/api/compliance/*, the workspace
 * as controller) and the platform console (/api/platform/compliance/*, AkunMu's operator). Workspace routes run
 * in the staff member's workspace, platform routes in the platform scope.
 */

type Params = Record<string, string>;
type Context<P extends Params> = { request: Request; params: P; url: URL; i18n: I18n; staff: StaffContext };
type Handler<P extends Params> = (context: Context<P>) => Promise<Response>;

/** Documents carry AkunMu's teal accent; workspaces have no brand color of their own. */
const DOCUMENT_ACCENT = "#0f766e";
const PRODUCT_NAME = "AkunMu";

/** Wraps a handler for the scope: workspace routes check the role permission, platform routes need platform staff. */
function route<P extends Params>(scope: ComplianceScope, permission: Permission, handler: Handler<P>) {
  if (scope === "tenant") return staffRoute<P>(permission, (context) => handler(context));
  return platformRoute<P>((context) => handler(context));
}

/** Platform staff may edit; in a workspace only admins may (editors read). */
function assertCanManage(scope: ComplianceScope, staff: StaffContext) {
  if (scope === "tenant" && !can(staff.user.role, "privacy.manage")) throw forbidden();
}

/** The operator's profile is platform data; workspace documents name the operator as their processor. */
async function context(scope: ComplianceScope, locale: Locale): Promise<RopaContext> {
  const operator = scope === "tenant" ? await asPlatform(() => loadPrivacyProfile()) : undefined;
  return loadRopaContext(scope, locale, operator);
}

/** Record keys may arrive percent-encoded (processor:devices → processor%3Adevices). */
function recordKey(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function documentLocale(url: URL, fallback: Locale): Locale {
  const requested = url.searchParams.get("lang");
  return isLocale(requested) ? requested : fallback;
}

function frame(): DocumentFrame {
  return { accent: DOCUMENT_ACCENT, product: PRODUCT_NAME };
}

async function respondDocument(url: URL, document: ComplianceDocument): Promise<Response> {
  const format = url.searchParams.get("format") ?? "pdf";
  if (!isDocumentFormat(format)) throw badRequest();
  const body = format === "pdf" ? await renderDocumentPdf(document) : await renderDocumentDocx(document);
  return new Response(Buffer.from(body), {
    headers: {
      "Content-Type": DOCUMENT_TYPES[format],
      "Content-Disposition": `attachment; filename="${document.fileName}.${format}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

function ownerTenant(scope: ComplianceScope, staff: StaffContext): number | null {
  return scope === "platform" ? null : staff.tenantId;
}

// ----- overview -----

export function overviewHandler(scope: ComplianceScope) {
  return route(scope, "privacy.read", async ({ i18n, staff }) => {
    const ctx = await context(scope, i18n.locale);
    const views = await listRopa(ctx);
    const owner = ownerTenant(scope, staff);
    const [openRequests, overdue, retention] = await Promise.all([countOpenRequests(owner), overdueIncidents(owner), loadRetentionPolicy()]);
    const controllerViews = views.filter((view) => view.kind !== "processor");
    return ok(
      {
        activities: views.length,
        incomplete: views.filter((view) => view.missing.length > 0).length,
        dpiaRequired: controllerViews.filter((view) => view.dpiaRequired).length,
        dpiaMissing: controllerViews.filter((view) => view.dpiaRequired && !view.dpia).length,
        dpiaApproved: controllerViews.filter((view) => view.dpia?.status === "approved").length,
        openRequests,
        overdueIncidents: overdue,
        profile: { dpo: Boolean(ctx.profile.dpoName && (ctx.profile.dpoEmail || ctx.profile.dpoPhone)), address: Boolean(ctx.profile.address) },
        retention: scope === "tenant" ? Boolean(retention.findingDays || retention.signedOutDays) : Boolean(retention.auditDays),
      },
      "",
      200,
      { "Cache-Control": "no-store" },
    );
  });
}

// ----- RoPA -----

export function ropaListHandlers(scope: ComplianceScope) {
  return {
    GET: route(scope, "privacy.read", async ({ i18n }) => ok(await listRopa(await context(scope, i18n.locale)), "", 200, { "Cache-Control": "no-store" })),
    POST: route(scope, "privacy.read", async ({ request, i18n, staff }) => {
      assertCanManage(scope, staff);
      const input = parseWith(ropaCreateSchema, await readJson(request));
      return created(await createCustomRopa(await context(scope, i18n.locale), input, staff.user.id), i18n.t("api.created"));
    }),
  };
}

export function ropaTrashHandler(scope: ComplianceScope) {
  return route(scope, "privacy.read", async ({ i18n }) => ok(await listTrashedRopa(await context(scope, i18n.locale))));
}

export function ropaItemHandlers(scope: ComplianceScope) {
  return {
    // ?lang= picks the language of defaults and corrections, so editors can work on one language at a time.
    GET: route<{ key: string }>(scope, "privacy.read", async ({ params, url, i18n }) =>
      ok(await getRopa(await context(scope, documentLocale(url, i18n.locale)), recordKey(params.key)), "", 200, { "Cache-Control": "no-store" }),
    ),
    PATCH: route<{ key: string }>(scope, "privacy.read", async ({ request, params, i18n, staff }) => {
      assertCanManage(scope, staff);
      const input = parseWith(ropaUpdateSchema, await readJson(request));
      return ok(await updateRopa(await context(scope, i18n.locale), recordKey(params.key), input, staff.user.id), i18n.t("api.updated"));
    }),
    DELETE: route<{ key: string }>(scope, "privacy.read", async ({ params, i18n, staff }) => {
      assertCanManage(scope, staff);
      await deleteCustomRopa(await context(scope, i18n.locale), recordKey(params.key), staff.user.id);
      return ok(null, i18n.t("api.deleted"));
    }),
  };
}

export function ropaRestoreHandler(scope: ComplianceScope) {
  return route<{ key: string }>(scope, "privacy.read", async ({ params, i18n, staff }) => {
    assertCanManage(scope, staff);
    return ok(await restoreCustomRopa(await context(scope, i18n.locale), recordKey(params.key), staff.user.id), i18n.t("api.restored"));
  });
}

export function ropaResetHandler(scope: ComplianceScope) {
  return route<{ key: string }>(scope, "privacy.read", async ({ params, i18n, staff }) => {
    assertCanManage(scope, staff);
    return ok(await resetRopa(await context(scope, i18n.locale), recordKey(params.key), staff.user.id), i18n.t("api.updated"));
  });
}

export function ropaDocumentHandler(scope: ComplianceScope) {
  return route<{ key: string }>(scope, "privacy.read", async ({ params, url, i18n }) => {
    const ctx = await context(scope, documentLocale(url, i18n.locale));
    const view = await getRopa(ctx, recordKey(params.key));
    return respondDocument(url, buildRopaDocument({ context: ctx, frame: frame() }, view));
  });
}

export function registerDocumentHandler(scope: ComplianceScope) {
  return route(scope, "privacy.read", async ({ url, i18n }) => {
    const ctx = await context(scope, documentLocale(url, i18n.locale));
    return respondDocument(url, buildRegisterDocument({ context: ctx, frame: frame() }, await listRopa(ctx)));
  });
}

// ----- DPIA -----

export function dpiaListHandlers(scope: ComplianceScope) {
  return {
    GET: route(scope, "privacy.read", async ({ i18n }) => ok(await listDpia(await context(scope, i18n.locale)), "", 200, { "Cache-Control": "no-store" })),
    POST: route(scope, "privacy.read", async ({ request, i18n, staff }) => {
      assertCanManage(scope, staff);
      const body = (await readJson(request)) as { key?: unknown };
      if (typeof body?.key !== "string" || body.key.length > 80) throw badRequest();
      return created(await createDpia(await context(scope, i18n.locale), body.key, staff.user.id, staff.user.name), i18n.t("api.created"));
    }),
  };
}

export function dpiaTrashHandler(scope: ComplianceScope) {
  return route(scope, "privacy.read", async ({ i18n }) => ok(await listDpia(await context(scope, i18n.locale), true)));
}

export function dpiaItemHandlers(scope: ComplianceScope) {
  return {
    GET: route<{ key: string }>(scope, "privacy.read", async ({ params, url, i18n }) =>
      ok(await getDpia(await context(scope, documentLocale(url, i18n.locale)), recordKey(params.key)), "", 200, { "Cache-Control": "no-store" }),
    ),
    PATCH: route<{ key: string }>(scope, "privacy.read", async ({ request, params, i18n, staff }) => {
      assertCanManage(scope, staff);
      const input = parseWith(dpiaUpdateSchema, await readJson(request));
      return ok(await updateDpia(await context(scope, i18n.locale), recordKey(params.key), input, staff.user.id), i18n.t("api.updated"));
    }),
    DELETE: route<{ key: string }>(scope, "privacy.read", async ({ params, i18n, staff }) => {
      assertCanManage(scope, staff);
      await deleteDpia(await context(scope, i18n.locale), recordKey(params.key), staff.user.id);
      return ok(null, i18n.t("api.deleted"));
    }),
  };
}

export function dpiaRestoreHandler(scope: ComplianceScope) {
  return route<{ key: string }>(scope, "privacy.read", async ({ params, i18n, staff }) => {
    assertCanManage(scope, staff);
    return ok(await restoreDpia(await context(scope, i18n.locale), recordKey(params.key), staff.user.id), i18n.t("api.restored"));
  });
}

export function dpiaDocumentHandler(scope: ComplianceScope) {
  return route<{ key: string }>(scope, "privacy.read", async ({ params, url, i18n }) => {
    const ctx = await context(scope, documentLocale(url, i18n.locale));
    const dpia = await getDpia(ctx, recordKey(params.key));
    const ropa = await getRopa(ctx, recordKey(params.key));
    return respondDocument(url, buildDpiaDocument({ context: ctx, frame: frame() }, dpia, ropa));
  });
}

// ----- incidents -----

export function incidentListHandlers(scope: ComplianceScope) {
  return {
    GET: route(scope, "privacy.read", async ({ url, staff }) => {
      const pagination = readPagination(url.searchParams);
      const { items, total } = await listIncidents(ownerTenant(scope, staff), { search: url.searchParams.get("search") ?? undefined, ...pagination });
      return ok(paginated(items, total, pagination), "", 200, { "Cache-Control": "no-store" });
    }),
    POST: route(scope, "privacy.read", async ({ request, i18n, staff }) => {
      assertCanManage(scope, staff);
      const input = parseWith(incidentInputSchema, await readJson(request));
      return created(await createIncident(ownerTenant(scope, staff), input, staff.user.id), i18n.t("api.created"));
    }),
  };
}

export function incidentTrashHandler(scope: ComplianceScope) {
  return route(scope, "privacy.read", async ({ url, staff }) => {
    const pagination = readPagination(url.searchParams);
    const { items, total } = await listIncidents(ownerTenant(scope, staff), { search: url.searchParams.get("search") ?? undefined, trashed: true, ...pagination });
    return ok(paginated(items, total, pagination));
  });
}

export function incidentItemHandlers(scope: ComplianceScope) {
  return {
    GET: route<{ id: string }>(scope, "privacy.read", async ({ params, staff }) => ok(await getIncident(ownerTenant(scope, staff), parseId(params.id)))),
    PATCH: route<{ id: string }>(scope, "privacy.read", async ({ request, params, i18n, staff }) => {
      assertCanManage(scope, staff);
      const input = parseWith(incidentUpdateSchema, await readJson(request));
      return ok(await updateIncident(ownerTenant(scope, staff), parseId(params.id), input, staff.user.id), i18n.t("api.updated"));
    }),
    DELETE: route<{ id: string }>(scope, "privacy.read", async ({ params, i18n, staff }) => {
      assertCanManage(scope, staff);
      await deleteIncident(ownerTenant(scope, staff), parseId(params.id), staff.user.id);
      return ok(null, i18n.t("api.deleted"));
    }),
  };
}

export function incidentRestoreHandler(scope: ComplianceScope) {
  return route<{ id: string }>(scope, "privacy.read", async ({ params, i18n, staff }) => {
    assertCanManage(scope, staff);
    return ok(await restoreIncident(ownerTenant(scope, staff), parseId(params.id), staff.user.id), i18n.t("api.restored"));
  });
}

export function incidentDocumentHandler(scope: ComplianceScope) {
  return route<{ id: string }>(scope, "privacy.read", async ({ params, url, i18n, staff }) => {
    const ctx = await context(scope, documentLocale(url, i18n.locale));
    const incident = await getIncident(ownerTenant(scope, staff), parseId(params.id));
    const names = activityNameMap(await listRopa(ctx));
    return respondDocument(url, buildIncidentDocument({ context: ctx, frame: frame() }, incident, names));
  });
}

// ----- data subject requests -----

export function requestListHandlers(scope: ComplianceScope) {
  return {
    GET: route(scope, "privacy.read", async ({ url, staff }) => {
      const pagination = readPagination(url.searchParams);
      const { items, total } = await listRequests(ownerTenant(scope, staff), { search: url.searchParams.get("search") ?? undefined, ...pagination });
      return ok(paginated(items, total, pagination), "", 200, { "Cache-Control": "no-store" });
    }),
    // A request received outside the app (email, letter) is recorded by staff; it gets the same deadline.
    POST: route(scope, "privacy.read", async ({ request, i18n, staff }) => {
      assertCanManage(scope, staff);
      const input = parseWith(staffRequestSchema, await readJson(request));
      return created(await recordStaffRequest(ownerTenant(scope, staff), input, staff.user.id), i18n.t("api.created"));
    }),
  };
}

export function requestTrashHandler(scope: ComplianceScope) {
  return route(scope, "privacy.read", async ({ url, staff }) => {
    const pagination = readPagination(url.searchParams);
    const { items, total } = await listRequests(ownerTenant(scope, staff), { search: url.searchParams.get("search") ?? undefined, trashed: true, ...pagination });
    return ok(paginated(items, total, pagination));
  });
}

export function requestItemHandlers(scope: ComplianceScope) {
  return {
    PATCH: route<{ id: string }>(scope, "privacy.read", async ({ request, params, i18n, staff }) => {
      assertCanManage(scope, staff);
      const input = parseWith(responseSchema, await readJson(request));
      return ok(await respondToRequest(ownerTenant(scope, staff), parseId(params.id), input, staff.user.id), i18n.t("api.updated"));
    }),
    DELETE: route<{ id: string }>(scope, "privacy.read", async ({ params, i18n, staff }) => {
      assertCanManage(scope, staff);
      await deleteRequest(ownerTenant(scope, staff), parseId(params.id), staff.user.id);
      return ok(null, i18n.t("api.deleted"));
    }),
  };
}

export function requestRestoreHandler(scope: ComplianceScope) {
  return route<{ id: string }>(scope, "privacy.read", async ({ params, i18n, staff }) => {
    assertCanManage(scope, staff);
    return ok(await restoreRequest(ownerTenant(scope, staff), parseId(params.id), staff.user.id), i18n.t("api.restored"));
  });
}

// ----- privacy settings (controller profile, PPDP, retention) -----

export function privacySettingsHandlers(scope: ComplianceScope) {
  return {
    GET: route(scope, "settings.manage", async ({ i18n }) => {
      const [profile, retention] = await Promise.all([loadPrivacyProfile(), loadRetentionPolicy()]);
      // The platform also sees where data is processed as detected from the deployment (before its overrides);
      // the users' own devices have no location to set.
      const detected =
        scope === "platform"
          ? await (async () => {
              const ctx = await context(scope, i18n.locale);
              const remote = INFRASTRUCTURE.filter((component) => !LOCAL_INFRASTRUCTURE.includes(component));
              return describeInfrastructure(remote, ctx.content.common, { aiProviders: ctx.aiProviders, overrides: {} });
            })()
          : [];
      return ok({ profile, retention, detected }, "", 200, { "Cache-Control": "no-store" });
    }),
    PUT: route(scope, "settings.manage", async ({ request, i18n, staff }) => {
      const body = (await readJson(request)) as { profile?: unknown; retention?: unknown };
      const profile = body?.profile !== undefined ? await savePrivacyProfile(parseWith(privacyProfileInputSchema, body.profile), staff.user.id) : await loadPrivacyProfile();
      const retention = body?.retention !== undefined ? await saveRetentionPolicy(parseWith(retentionInputSchema, body.retention), staff.user.id) : await loadRetentionPolicy();
      return ok({ profile, retention }, i18n.t("api.updated"));
    }),
  };
}
