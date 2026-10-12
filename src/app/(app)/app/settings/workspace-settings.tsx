"use client";

import { Building2 } from "lucide-react";
import { useState } from "react";
import { api, ApiClientError, firstFieldErrors } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { LOCALES } from "@/shared/i18n/locales";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/feedback";
import { Field, Input, Select, Textarea } from "@/shared/ui/form-controls";
import { useApi } from "@/shared/ui/use-api";
import { useToast } from "@/shared/ui/toast";

type Workspace = {
  slug: string;
  name: string;
  legalName: string;
  contactEmail: string;
  locale: string;
  address: string;
  phone: string;
  website: string;
};

/** The workspace's name, legal identity and contacts; RoPA and DPIA documents name it as the controller. */
export function WorkspaceSettings() {
  const { t } = useI18n();
  const notify = useToast();
  const loaded = useApi<Workspace>("/api/settings/workspace");
  const [draft, setDraft] = useState<Workspace | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  if (!loaded.data) {
    return (
      <Card className="p-5">
        <Skeleton className="h-56 w-full" />
      </Card>
    );
  }
  const state = draft ?? loaded.data;
  const set = (patch: Partial<Workspace>) => setDraft({ ...state, ...patch });

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const { data, message } = await api<Workspace>("/api/settings/workspace", { method: "PUT", body: state });
      loaded.setData(data);
      setDraft(null);
      notify(message);
    } catch (error) {
      setErrors(firstFieldErrors(error));
      notify(error instanceof ApiClientError && error.message ? error.message : t("common.requestFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Building2 className="size-5 text-accent" />
            {t("settings.org.title")}
          </h2>
          <p className="mt-1 text-sm text-muted">{t("settings.org.subtitle")}</p>
        </div>
        <Button onClick={() => void save()} loading={saving} disabled={!draft}>
          {t("common.save")}
        </Button>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label={t("settings.org.name")} htmlFor="orgName" required error={errors.name}>
          <Input id="orgName" value={state.name} onChange={(e) => set({ name: e.target.value })} invalid={Boolean(errors.name)} />
        </Field>
        <Field label={t("settings.org.legalName")} htmlFor="orgLegalName" hint={t("settings.org.legalNameHint")} error={errors.legalName}>
          <Input id="orgLegalName" value={state.legalName} onChange={(e) => set({ legalName: e.target.value })} />
        </Field>
        <Field label={t("settings.org.contactEmail")} htmlFor="orgEmail" required error={errors.contactEmail}>
          <Input id="orgEmail" type="email" value={state.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} invalid={Boolean(errors.contactEmail)} />
        </Field>
        <Field label={t("settings.org.phone")} htmlFor="orgPhone" optionalLabel={t("common.optional")} error={errors.phone}>
          <Input id="orgPhone" type="tel" value={state.phone} onChange={(e) => set({ phone: e.target.value })} />
        </Field>
        <Field label={t("settings.org.website")} htmlFor="orgWebsite" optionalLabel={t("common.optional")} error={errors.website}>
          <Input id="orgWebsite" value={state.website} placeholder="https://" onChange={(e) => set({ website: e.target.value })} />
        </Field>
        <Field label={t("settings.org.locale")} htmlFor="orgLocale" hint={t("settings.org.localeHint")} error={errors.locale}>
          <Select id="orgLocale" value={state.locale} onChange={(e) => set({ locale: e.target.value })}>
            <option value="">{t("settings.org.localeDefault")}</option>
            {LOCALES.map((entry) => (
              <option key={entry.code} value={entry.code}>
                {entry.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("settings.org.address")} htmlFor="orgAddress" optionalLabel={t("common.optional")} error={errors.address} className="md:col-span-2 xl:col-span-3">
          <Textarea id="orgAddress" value={state.address} onChange={(e) => set({ address: e.target.value })} className="min-h-16" />
        </Field>
      </div>
      <p className="mt-4 text-xs text-muted">{t("settings.org.slugNote", { slug: state.slug })}</p>
    </Card>
  );
}
