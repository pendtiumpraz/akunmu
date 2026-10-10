"use client";

import { Gauge, Sparkles } from "lucide-react";
import { useState } from "react";
import type { AiPreset, AiQuotaConfig } from "@/modules/ai/types";
import { api, ApiClientError } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Alert, Skeleton } from "@/shared/ui/feedback";
import { Field, Input } from "@/shared/ui/form-controls";
import { useApi } from "@/shared/ui/use-api";
import { useToast } from "@/shared/ui/toast";
import { AiProvidersEditor, providerPayload, type ProviderDraft, type ProvidersValue } from "../../../(app)/app/settings/ai-providers-editor";

type MaskedProvider = Omit<ProviderDraft, "apiKey"> & { id: string; apiKey: null };
type Loaded = {
  config: { providers: MaskedProvider[]; defaultProviderId: string | null; defaultModel: string | null };
  quotas: AiQuotaConfig;
  usage: { tenantId: number; name: string; slug: string; status: string; requests: number | null }[];
  presets: AiPreset[];
};

function toValue(config: Loaded["config"]): ProvidersValue {
  return { ...config, providers: config.providers.map((provider) => ({ ...provider, apiKey: "" })) };
}

export function PlatformAi() {
  const { t, format } = useI18n();
  const notify = useToast();
  const loaded = useApi<Loaded>("/api/platform/ai");
  const [draft, setDraft] = useState<ProvidersValue | null>(null);
  const [quotas, setQuotas] = useState<AiQuotaConfig | null>(null);
  const [saving, setSaving] = useState<"providers" | "quotas" | null>(null);

  if (!loaded.data) {
    return (
      <Card className="p-5">
        <Skeleton className="h-48 w-full" />
      </Card>
    );
  }
  const value = draft ?? toValue(loaded.data.config);
  const quota = quotas ?? loaded.data.quotas;
  const failure = (error: unknown) => notify(error instanceof ApiClientError && error.message ? error.message : t("common.requestFailed"), "error");

  const saveProviders = async () => {
    setSaving("providers");
    try {
      const { message } = await api("/api/platform/ai", { method: "PUT", body: { ...value, providers: value.providers.map(providerPayload) } });
      notify(message);
      setDraft(null);
      loaded.reload();
    } catch (error) {
      failure(error);
    } finally {
      setSaving(null);
    }
  };

  const saveQuotas = async () => {
    setSaving("quotas");
    try {
      const { message } = await api("/api/platform/ai/quotas", { method: "PUT", body: quota });
      notify(message);
      setQuotas(null);
      loaded.reload();
    } catch (error) {
      failure(error);
    } finally {
      setSaving(null);
    }
  };

  const limitFor = (tenantId: number, status: string) => quota.byTenant[String(tenantId)] ?? (status === "trial" ? quota.trialMonthly : quota.monthly);

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
              <Sparkles className="size-5 text-accent" />
              {t("ai.providersTitle")}
            </h2>
            <p className="mt-1 text-sm text-muted">{t("ai.providersSubtitle")}</p>
          </div>
          <Button onClick={() => void saveProviders()} loading={saving === "providers"} disabled={!draft}>
            {t("common.save")}
          </Button>
        </div>
        <div className="mt-5">
          <AiProvidersEditor value={value} onChange={setDraft} presets={loaded.data.presets} probeUrl="/api/platform/ai/probe" />
        </div>
        <Alert tone="info" className="mt-5">
          {t("ai.privacyNote")}
        </Alert>
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
              <Gauge className="size-5 text-accent" />
              {t("ai.quotasTitle")}
            </h2>
            <p className="mt-1 text-sm text-muted">{t("ai.quotasSubtitle")}</p>
          </div>
          <Button onClick={() => void saveQuotas()} loading={saving === "quotas"} disabled={!quotas}>
            {t("common.save")}
          </Button>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label={t("ai.quotaMonthly")} htmlFor="quotaMonthly">
            <Input id="quotaMonthly" type="number" min={0} value={quota.monthly} onChange={(e) => setQuotas({ ...quota, monthly: Number(e.target.value) || 0 })} />
          </Field>
          <Field label={t("ai.quotaTrial")} htmlFor="quotaTrial">
            <Input id="quotaTrial" type="number" min={0} value={quota.trialMonthly} onChange={(e) => setQuotas({ ...quota, trialMonthly: Number(e.target.value) || 0 })} />
          </Field>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3 font-medium">{t("platform.navTenants")}</th>
                <th className="py-2 pr-3 font-medium">{t("ai.usageThisMonth")}</th>
                <th className="py-2 font-medium">{t("ai.quotaOverride")}</th>
              </tr>
            </thead>
            <tbody>
              {loaded.data.usage.map((row) => {
                const limit = limitFor(row.tenantId, row.status);
                const used = row.requests ?? 0;
                return (
                  <tr key={row.tenantId} className="border-t border-line">
                    <td className="py-2.5 pr-3">
                      <p className="font-medium text-ink">{row.name}</p>
                      <p className="font-mono text-xs text-muted">{row.slug}</p>
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums">
                      {format.number(used)} / {format.number(limit)}
                      <span className="mt-1 block h-1.5 w-32 overflow-hidden rounded-full bg-sunken">
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${limit ? Math.min(100, (used / limit) * 100) : 100}%` }} />
                      </span>
                    </td>
                    <td className="py-2.5">
                      <Input
                        aria-label={`${t("ai.quotaOverride")} ${row.name}`}
                        type="number"
                        min={0}
                        value={quota.byTenant[String(row.tenantId)] ?? ""}
                        placeholder={String(row.status === "trial" ? quota.trialMonthly : quota.monthly)}
                        onChange={(e) => {
                          const byTenant = { ...quota.byTenant };
                          if (e.target.value === "") delete byTenant[String(row.tenantId)];
                          else byTenant[String(row.tenantId)] = Number(e.target.value) || 0;
                          setQuotas({ ...quota, byTenant });
                        }}
                        className="max-w-32"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
