"use client";

import { useState } from "react";
import type { TenantListItem } from "@/modules/tenants/service";
import { TENANT_STATUSES, type TenantStatus } from "@/modules/tenants/types";
import { api, ApiClientError, firstFieldErrors, type Json } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { LOCALES } from "@/shared/i18n/locales";
import { slugify } from "@/shared/text";
import { Button } from "@/shared/ui/button";
import { Drawer } from "@/shared/ui/drawer";
import { Alert } from "@/shared/ui/feedback";
import { Field, Input, Select } from "@/shared/ui/form-controls";
import { useToast } from "@/shared/ui/toast";

export type TenantRow = Json<TenantListItem>;

/** What the platform API returns after creating a tenant (the password only when an admin was added). */
export type CreatedTenant = { tenant: TenantRow; admin: { email: string } | null; temporaryPassword: string | null };

type FormState = {
  name: string;
  slug: string;
  legalName: string;
  contactEmail: string;
  status: TenantStatus;
  locale: string;
  adminName: string;
  adminEmail: string;
};

function initialState(tenant: TenantRow | null): FormState {
  return {
    name: tenant?.name ?? "",
    slug: tenant?.slug ?? "",
    legalName: tenant?.legalName ?? "",
    contactEmail: tenant?.contactEmail ?? "",
    status: tenant?.status ?? "active",
    locale: tenant?.locale ?? "",
    adminName: "",
    adminEmail: "",
  };
}

/** Create/edit form for a workspace. Mounted only while open, so every opening starts fresh. */
export function TenantDrawer({ tenant, onClose, onSaved }: { tenant: TenantRow | null; onClose: () => void; onSaved: (created: CreatedTenant | null) => void }) {
  const { t } = useI18n();
  const notify = useToast();
  const [state, setState] = useState<FormState>(() => initialState(tenant));
  const [slugEdited, setSlugEdited] = useState(Boolean(tenant));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setState((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    setErrors({});
    setFormError(null);
    try {
      if (tenant) {
        const { message } = await api(`/api/platform/tenants/${tenant.id}`, {
          method: "PATCH",
          body: { name: state.name, legalName: state.legalName, contactEmail: state.contactEmail, status: state.status, locale: state.locale },
        });
        notify(message);
        onSaved(null);
      } else {
        const { data, message } = await api<CreatedTenant>("/api/platform/tenants", { body: state });
        notify(message);
        onSaved(data);
      }
    } catch (error) {
      setErrors(firstFieldErrors(error));
      setFormError(error instanceof ApiClientError && error.message ? error.message : t("common.requestFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={tenant ? t("platform.editTenant") : t("platform.newTenant")}
      closeLabel={t("common.close")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} loading={saving}>
            {tenant ? t("common.saveChanges") : t("common.create")}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <Field label={t("platform.fieldName")} htmlFor="tenant-name" required error={errors.name}>
          <Input
            id="tenant-name"
            value={state.name}
            onChange={(event) => {
              const name = event.target.value;
              setState((current) => ({ ...current, name, slug: slugEdited ? current.slug : slugify(name).slice(0, 40) }));
            }}
            invalid={Boolean(errors.name)}
          />
        </Field>
        <Field label={t("platform.fieldSlug")} htmlFor="tenant-slug" hint={t("platform.fieldSlugHint", { slug: state.slug || "…" })} error={errors.slug} required>
          <Input
            id="tenant-slug"
            value={state.slug}
            disabled={Boolean(tenant)}
            onChange={(event) => {
              setSlugEdited(true);
              set("slug", event.target.value.toLowerCase());
            }}
            invalid={Boolean(errors.slug)}
            className="font-mono text-[13px]"
          />
        </Field>
        <Field label={t("platform.fieldLegalName")} htmlFor="tenant-legal" optionalLabel={t("common.optional")} error={errors.legalName}>
          <Input id="tenant-legal" value={state.legalName} onChange={(event) => set("legalName", event.target.value)} />
        </Field>
        <Field label={t("platform.fieldContactEmail")} htmlFor="tenant-email" required error={errors.contactEmail}>
          <Input id="tenant-email" type="email" value={state.contactEmail} onChange={(event) => set("contactEmail", event.target.value)} invalid={Boolean(errors.contactEmail)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("platform.fieldStatus")} htmlFor="tenant-status">
            <Select id="tenant-status" value={state.status} onChange={(event) => set("status", event.target.value as TenantStatus)}>
              {TENANT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t.dynamic(`platform.status_${status}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("platform.fieldLocale")} htmlFor="tenant-locale">
            <Select id="tenant-locale" value={state.locale} onChange={(event) => set("locale", event.target.value)}>
              <option value="">{t("common.none")}</option>
              {LOCALES.map((locale) => (
                <option key={locale.code} value={locale.code}>
                  {locale.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {tenant ? null : (
          <div className="space-y-4 rounded-xl bg-canvas p-4 ring-1 ring-line">
            <p className="text-[13px] font-semibold text-ink">{t("platform.adminSection")}</p>
            <Field label={t("platform.fieldAdminName")} htmlFor="tenant-admin-name" error={errors.adminName}>
              <Input id="tenant-admin-name" value={state.adminName} onChange={(event) => set("adminName", event.target.value)} />
            </Field>
            <Field label={t("platform.fieldAdminEmail")} htmlFor="tenant-admin-email" error={errors.adminEmail}>
              <Input id="tenant-admin-email" type="email" value={state.adminEmail} onChange={(event) => set("adminEmail", event.target.value)} invalid={Boolean(errors.adminEmail)} />
            </Field>
          </div>
        )}
      </div>
    </Drawer>
  );
}
