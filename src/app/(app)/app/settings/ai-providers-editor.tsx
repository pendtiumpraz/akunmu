"use client";

import { CircleCheck, KeyRound, ListRestart, Pencil, Plus, Star, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import type { AiPreset, AiProviderKind } from "@/modules/ai/types";
import { api, ApiClientError } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { Alert } from "@/shared/ui/feedback";
import { Badge } from "@/shared/ui/badge";
import { Button, IconButton } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { Field, Input, Select, Switch, Textarea } from "@/shared/ui/form-controls";

/** A provider as the settings screens hold it: the key is write-only (`apiKey` is what was typed, `hasKey` what is stored). */
export type ProviderDraft = {
  id: string | null;
  preset: string;
  kind: AiProviderKind;
  label: string;
  baseUrl: string;
  apiKey: string;
  hasKey: boolean;
  models: string[];
  enabled: boolean;
};

export type ProvidersValue = { providers: ProviderDraft[]; defaultProviderId: string | null; defaultModel: string | null };

type ProbeResult = { ok: true; models?: string[]; model?: string; ms?: number } | { ok: false; error: string };

function fromPreset(preset: AiPreset): ProviderDraft {
  return { id: null, preset: preset.id, kind: preset.kind, label: preset.label, baseUrl: preset.baseUrl, apiKey: "", hasKey: false, models: preset.models, enabled: true };
}

/** What the API takes for a provider. */
export function providerPayload(provider: ProviderDraft) {
  return { id: provider.id, preset: provider.preset, kind: provider.kind, label: provider.label, baseUrl: provider.baseUrl, apiKey: provider.apiKey, models: provider.models, enabled: provider.enabled };
}

/** Provider list with an inline form; changes stay local until the screen's own Save. */
export function AiProvidersEditor({
  value,
  onChange,
  presets,
  probeUrl,
}: {
  value: ProvidersValue;
  onChange: (value: ProvidersValue) => void;
  presets: AiPreset[];
  probeUrl: string;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState<{ index: number | null; draft: ProviderDraft } | null>(null);
  const [probe, setProbe] = useState<{ busy: "test" | "models" | null; message: string | null; tone: "success" | "danger" }>({ busy: null, message: null, tone: "success" });

  const allModels = value.providers.filter((provider) => provider.enabled).flatMap((provider) => provider.models);

  const startEdit = (index: number | null, draft: ProviderDraft) => {
    setProbe({ busy: null, message: null, tone: "success" });
    setEditing({ index, draft });
  };

  const applyEdit = () => {
    if (!editing) return;
    const providers = [...value.providers];
    if (editing.index === null) providers.push(editing.draft);
    else providers[editing.index] = editing.draft;
    onChange({ ...value, providers });
    setEditing(null);
  };

  const remove = (index: number) => {
    const removed = value.providers[index];
    onChange({
      ...value,
      providers: value.providers.filter((_, position) => position !== index),
      defaultProviderId: value.defaultProviderId === removed.id ? null : value.defaultProviderId,
    });
  };

  const runProbe = async (action: "test" | "models") => {
    if (!editing) return;
    setProbe({ busy: action, message: null, tone: "success" });
    try {
      const { data } = await api<ProbeResult>(probeUrl, { method: "POST", body: { provider: providerPayload(editing.draft), action } });
      if (!data.ok) setProbe({ busy: null, message: t("ai.testFailed", { error: data.error }), tone: "danger" });
      else if (action === "models") {
        setEditing({ ...editing, draft: { ...editing.draft, models: data.models ?? [] } });
        setProbe({ busy: null, message: t("ai.modelsLoaded", { count: data.models?.length ?? 0 }), tone: "success" });
      } else setProbe({ busy: null, message: t("ai.testOk", { model: data.model ?? "", ms: data.ms ?? 0 }), tone: "success" });
    } catch (error) {
      setProbe({ busy: null, message: error instanceof ApiClientError && error.message ? error.message : t("common.requestFailed"), tone: "danger" });
    }
  };

  const draft = editing?.draft;
  const setDraft = (patch: Partial<ProviderDraft>) => editing && setEditing({ ...editing, draft: { ...editing.draft, ...patch } });

  return (
    <div className="space-y-4">
      {value.providers.length === 0 && !editing ? <p className="rounded-xl bg-subtle px-4 py-6 text-center text-sm text-muted">{t("ai.noProviders")}</p> : null}
      <ul className="space-y-2">
        {value.providers.map((provider, index) => {
          const isDefault = value.defaultProviderId ? provider.id === value.defaultProviderId : index === 0;
          return (
            <li key={provider.id ?? `new-${index}`} className={cn("flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3", isDefault ? "border-accent-line bg-accent-soft" : "border-line")}>
              <button
                type="button"
                aria-label={t("ai.defaultProvider")}
                title={t("ai.defaultProvider")}
                onClick={() => onChange({ ...value, defaultProviderId: provider.id })}
                disabled={!provider.id}
                className={cn("rounded-lg p-1.5", isDefault ? "text-warn" : "text-faint hover:text-muted")}
              >
                <Star className="size-4" fill={isDefault ? "currentColor" : "none"} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                  {provider.label}
                  <Badge tone="neutral">{provider.kind === "anthropic" ? t("ai.kindAnthropic") : t("ai.kindOpenai")}</Badge>
                  <Badge tone={provider.hasKey || provider.apiKey ? "ok" : "warn"}>
                    <KeyRound className="size-3" />
                    {provider.hasKey || provider.apiKey ? t("ai.keyStored") : t("ai.keyMissing")}
                  </Badge>
                </p>
                <p className="truncate font-mono text-xs text-muted">
                  {provider.baseUrl || "—"} · {provider.models.join(", ") || "—"}
                </p>
              </div>
              <Switch id={`enabled-${index}`} checked={provider.enabled} onChange={(enabled) => onChange({ ...value, providers: value.providers.map((item, position) => (position === index ? { ...item, enabled } : item)) })} label={t("ai.enabled")} />
              <IconButton label={t("common.edit")} onClick={() => startEdit(index, { ...provider, apiKey: "" })}>
                <Pencil className="size-4" />
              </IconButton>
              <IconButton label={t("ai.remove")} onClick={() => remove(index)}>
                <Trash2 className="size-4 text-danger" />
              </IconButton>
            </li>
          );
        })}
      </ul>

      {draft ? (
        <div className="space-y-4 rounded-2xl border border-accent-line bg-surface p-4 shadow-card">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("ai.preset")} htmlFor="aiPreset">
              <Select
                id="aiPreset"
                value={draft.preset}
                onChange={(e) => {
                  const preset = presets.find((item) => item.id === e.target.value);
                  if (preset) setDraft({ preset: preset.id, kind: preset.kind, label: preset.label, baseUrl: preset.baseUrl, models: preset.models.length ? preset.models : draft.models });
                }}
              >
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("ai.label")} htmlFor="aiLabel">
              <Input id="aiLabel" value={draft.label} onChange={(e) => setDraft({ label: e.target.value })} />
            </Field>
          </div>
          <Field label={t("ai.baseUrl")} htmlFor="aiBaseUrl" hint={draft.preset === "netra" || !draft.baseUrl ? t("ai.baseUrlHint") : undefined}>
            <Input id="aiBaseUrl" value={draft.baseUrl} onChange={(e) => setDraft({ baseUrl: e.target.value })} placeholder="https://" className="font-mono text-[13px]" />
          </Field>
          <Field label={t("ai.apiKey")} htmlFor="aiKey" hint={draft.hasKey ? t("ai.apiKeyKeep") : undefined}>
            <Input id="aiKey" type="password" autoComplete="off" value={draft.apiKey} onChange={(e) => setDraft({ apiKey: e.target.value })} placeholder={draft.hasKey ? "••••••••" : ""} className="font-mono text-[13px]" />
          </Field>
          <Field label={t("ai.models")} htmlFor="aiModels" hint={t("ai.modelsHint")}>
            <Textarea
              id="aiModels"
              rows={4}
              value={draft.models.join("\n")}
              onChange={(e) => setDraft({ models: e.target.value.split(/\r?\n/).map((model) => model.trim()).filter(Boolean) })}
              className="font-mono text-[13px]"
            />
          </Field>
          {probe.message ? <Alert tone={probe.tone}>{probe.message}</Alert> : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => void runProbe("models")} loading={probe.busy === "models"} disabled={!draft.baseUrl}>
              <ListRestart className="size-4" />
              {t("ai.loadModels")}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void runProbe("test")} loading={probe.busy === "test"} disabled={!draft.baseUrl || draft.models.length === 0}>
              <Zap className="size-4" />
              {t("ai.test")}
            </Button>
            <span className="flex-1" />
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={applyEdit} disabled={!draft.label || !draft.baseUrl}>
              <CircleCheck className="size-4" />
              {t("common.save")}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => startEdit(null, fromPreset(presets[0]))}>
          <Plus className="size-4" />
          {t("ai.addProvider")}
        </Button>
      )}

      {allModels.length > 0 ? (
        <Field label={t("ai.defaultModel")} htmlFor="aiDefaultModel">
          <Select id="aiDefaultModel" value={value.defaultModel ?? ""} onChange={(e) => onChange({ ...value, defaultModel: e.target.value || null })} className="sm:max-w-sm">
            <option value="">{allModels[0]}</option>
            {allModels.slice(1).map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
    </div>
  );
}
