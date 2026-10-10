"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";
import type { AiPreset, TenantAiMode } from "@/modules/ai/types";
import { api, ApiClientError } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { cn } from "@/shared/ui/cn";
import { Alert, Skeleton } from "@/shared/ui/feedback";
import { useApi } from "@/shared/ui/use-api";
import { useToast } from "@/shared/ui/toast";
import { AiProvidersEditor, providerPayload, type ProviderDraft, type ProvidersValue } from "./ai-providers-editor";

type MaskedProvider = Omit<ProviderDraft, "apiKey"> & { id: string; apiKey: null };
type Loaded = {
  config: { mode: TenantAiMode; providers: MaskedProvider[]; defaultProviderId: string | null; defaultModel: string | null };
  usage: { requests: number; limit: number | null; source: TenantAiMode };
  platformLimit: number;
  presets: AiPreset[];
};
type Draft = ProvidersValue & { mode: TenantAiMode };

/** The workspace's AI: AkunMu's providers within the plan's quota, or its own key (BYOK). */
export function AiSettings() {
  const { t, format } = useI18n();
  const notify = useToast();
  const loaded = useApi<Loaded>("/api/settings/ai");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  if (!loaded.data) {
    return (
      <Card className="p-5">
        <Skeleton className="h-32 w-full" />
      </Card>
    );
  }
  const { usage, platformLimit, presets } = loaded.data;
  const value: Draft = draft ?? { ...loaded.data.config, providers: loaded.data.config.providers.map((provider) => ({ ...provider, apiKey: "" })) };

  const save = async () => {
    setSaving(true);
    try {
      const { message } = await api("/api/settings/ai", { method: "PUT", body: { ...value, providers: value.providers.map(providerPayload) } });
      notify(message);
      setDraft(null);
      loaded.reload();
    } catch (error) {
      notify(error instanceof ApiClientError && error.message ? error.message : t("common.requestFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const modes: { mode: TenantAiMode; title: string; hint: string }[] = [
    { mode: "platform", title: t("ai.modePlatform"), hint: t("ai.modePlatformHint", { limit: format.number(platformLimit) }) },
    { mode: "own", title: t("ai.modeOwn"), hint: t("ai.modeOwnHint") },
  ];

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Sparkles className="size-5 text-accent" />
            {t("ai.tenantTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted">{t("ai.tenantSubtitle")}</p>
          <p className="mt-2 text-sm font-medium text-ink">
            {usage.limit !== null
              ? t("ai.usage", { used: format.number(usage.requests), limit: format.number(usage.limit) })
              : t("ai.usageOwn", { used: format.number(usage.requests) })}
          </p>
        </div>
        <Button onClick={() => void save()} loading={saving} disabled={!draft}>
          {t("common.save")}
        </Button>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t("ai.tenantTitle")}>
        {modes.map((option) => (
          <button
            key={option.mode}
            type="button"
            role="radio"
            aria-checked={value.mode === option.mode}
            onClick={() => setDraft({ ...value, mode: option.mode })}
            className={cn(
              "rounded-xl border p-4 text-left transition",
              value.mode === option.mode ? "border-accent bg-accent-soft ring-1 ring-accent" : "border-line hover:border-line-strong",
            )}
          >
            <span className="block font-semibold text-ink">{option.title}</span>
            <span className="mt-1 block text-sm text-muted">{option.hint}</span>
          </button>
        ))}
      </div>
      {value.mode === "own" ? (
        <div className="mt-5 space-y-3">
          <p className="text-sm text-muted">{t("ai.ownProvidersSubtitle")}</p>
          <AiProvidersEditor value={value} onChange={(next) => setDraft({ ...value, ...next })} presets={presets} probeUrl="/api/settings/ai/probe" />
        </div>
      ) : null}
      <Alert tone="info" className="mt-5">
        {t("ai.privacyNote")}
      </Alert>
    </Card>
  );
}
