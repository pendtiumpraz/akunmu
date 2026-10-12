"use client";

import { MapPin, ShieldCheck, Timer, UserRound, Building2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Infrastructure } from "@/modules/compliance/catalog";
import type { InfrastructureLocation } from "@/modules/compliance/hosting";
import type { PrivacyProfile, RetentionPolicy } from "@/modules/compliance/profile";
import { api, ApiClientError, firstFieldErrors } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Alert, Skeleton } from "@/shared/ui/feedback";
import { Field, Input, Textarea } from "@/shared/ui/form-controls";
import { useApi } from "@/shared/ui/use-api";
import { useToast } from "@/shared/ui/toast";

type Loaded = { profile: PrivacyProfile; retention: RetentionPolicy; detected: InfrastructureLocation[] };

/** Blocks a settings tab can show; the tenant and the platform pick different ones. */
export type PrivacyBlock = "operator" | "officer" | "pic" | "retentionTenant" | "retentionPlatform" | "locations";

type Draft = { profile: PrivacyProfile; retention: Record<keyof RetentionPolicy, string> };

function toDraft(data: Loaded): Draft {
  const days = (value: number | null) => (value ? String(value) : "");
  return {
    profile: { ...data.profile, locations: { ...data.profile.locations } },
    retention: {
      findingDays: days(data.retention.findingDays),
      signedOutDays: days(data.retention.signedOutDays),
      aiDays: days(data.retention.aiDays),
      auditDays: days(data.retention.auditDays),
    },
  };
}

function Block({ icon, title, hint, children }: { icon: ReactNode; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        {icon}
        {title}
      </h3>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

/**
 * Controller identity, privacy officer (PPDP), default person in charge, retention periods and data
 * locations. One form per scope (workspace or platform); each tab shows the blocks it needs.
 */
export function PrivacySettings({ endpoint, blocks, title, subtitle }: { endpoint: string; blocks: PrivacyBlock[]; title: string; subtitle: string }) {
  const { t } = useI18n();
  const notify = useToast();
  const loaded = useApi<Loaded>(endpoint);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  if (!loaded.data) {
    return (
      <Card className="p-5">
        <Skeleton className="h-56 w-full" />
      </Card>
    );
  }
  const state = draft ?? toDraft(loaded.data);
  const setProfile = (patch: Partial<PrivacyProfile>) => setDraft({ ...state, profile: { ...state.profile, ...patch } });
  const setRetention = (patch: Partial<Draft["retention"]>) => setDraft({ ...state, retention: { ...state.retention, ...patch } });
  const setLocation = (component: Infrastructure, value: string) =>
    setDraft({ ...state, profile: { ...state.profile, locations: { ...state.profile.locations, [component]: value } } });

  const save = async () => {
    setSaving(true);
    setErrors({});
    const days = (value: string) => (value.trim() === "" ? null : Number(value));
    try {
      const { data, message } = await api<Loaded>(endpoint, {
        method: "PUT",
        body: {
          profile: state.profile,
          retention: {
            findingDays: days(state.retention.findingDays),
            signedOutDays: days(state.retention.signedOutDays),
            aiDays: days(state.retention.aiDays),
            auditDays: days(state.retention.auditDays),
          },
        },
      });
      loaded.setData({ ...data, detected: loaded.data?.detected ?? [] });
      setDraft(null);
      notify(message);
    } catch (error) {
      setErrors(firstFieldErrors(error));
      notify(error instanceof ApiClientError && error.message ? error.message : t("common.requestFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const text = (key: keyof PrivacyProfile, label: string, options: { type?: string; required?: boolean; placeholder?: string } = {}) => (
    <Field label={label} htmlFor={`privacy-${key}`} optionalLabel={options.required ? undefined : t("common.optional")} error={errors[`profile.${key}`]}>
      <Input
        id={`privacy-${key}`}
        type={options.type ?? "text"}
        value={String(state.profile[key] ?? "")}
        placeholder={options.placeholder}
        onChange={(event) => setProfile({ [key]: event.target.value } as Partial<PrivacyProfile>)}
        invalid={Boolean(errors[`profile.${key}`])}
      />
    </Field>
  );

  const days = (key: keyof RetentionPolicy, label: string, hint: string) => (
    <Field label={label} htmlFor={`retention-${key}`} hint={hint} error={errors[`retention.${key}`]}>
      <div className="flex items-center gap-2">
        <Input
          id={`retention-${key}`}
          type="number"
          min={1}
          max={3650}
          value={state.retention[key]}
          placeholder={t("settings.privacy.off")}
          onChange={(event) => setRetention({ [key]: event.target.value } as Partial<Draft["retention"]>)}
          className="w-28"
          invalid={Boolean(errors[`retention.${key}`])}
        />
        <span className="text-sm text-muted">{t("settings.privacy.days")}</span>
      </div>
    </Field>
  );

  const missingOfficer = blocks.includes("officer") && !(loaded.data.profile.dpoName && (loaded.data.profile.dpoEmail || loaded.data.profile.dpoPhone));

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <ShieldCheck className="size-5 text-accent" />
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>
        <Button onClick={() => void save()} loading={saving} disabled={!draft}>
          {t("common.save")}
        </Button>
      </div>
      {missingOfficer ? (
        <Alert tone="warning" className="mt-4">
          {t("settings.privacy.officerMissing")}
        </Alert>
      ) : null}
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {blocks.includes("operator") ? (
          <div className="lg:col-span-3">
            <Block icon={<Building2 className="size-4 text-accent" />} title={t("settings.privacy.operatorTitle")} hint={t("settings.privacy.operatorHint")}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {text("legalName", t("settings.org.legalName"), { required: true })}
                {text("email", t("settings.org.contactEmail"), { type: "email", required: true })}
                {text("phone", t("settings.org.phone"), { type: "tel" })}
                {text("website", t("settings.org.website"), { placeholder: "https://" })}
                <Field label={t("settings.org.address")} htmlFor="privacy-address" optionalLabel={t("common.optional")} className="md:col-span-2">
                  <Textarea id="privacy-address" value={state.profile.address} onChange={(event) => setProfile({ address: event.target.value })} className="min-h-10" />
                </Field>
              </div>
            </Block>
          </div>
        ) : null}
        {blocks.includes("officer") ? (
          <Block icon={<ShieldCheck className="size-4 text-accent" />} title={t("settings.privacy.officerTitle")} hint={t("settings.privacy.officerHint")}>
            {text("dpoName", t("settings.privacy.dpoName"), { required: true })}
            {text("dpoEmail", t("settings.privacy.dpoEmail"), { type: "email" })}
            {text("dpoPhone", t("settings.privacy.dpoPhone"), { type: "tel" })}
          </Block>
        ) : null}
        {blocks.includes("pic") ? (
          <Block icon={<UserRound className="size-4 text-ok-ink" />} title={t("settings.privacy.picTitle")} hint={t("settings.privacy.picHint")}>
            {text("picName", t("settings.privacy.picName"))}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {text("picRole", t("settings.privacy.picRole"))}
              {text("unit", t("settings.privacy.unit"))}
            </div>
            {text("picEmail", t("settings.privacy.picEmail"), { type: "email" })}
          </Block>
        ) : null}
        {blocks.includes("retentionTenant") ? (
          <Block icon={<Timer className="size-4 text-warn-ink" />} title={t("settings.privacy.retentionTitle")} hint={t("settings.privacy.retentionHint")}>
            {days("findingDays", t("settings.privacy.findingDays"), t("settings.privacy.findingDaysHint"))}
            {days("signedOutDays", t("settings.privacy.signedOutDays"), t("settings.privacy.signedOutDaysHint"))}
            {days("aiDays", t("settings.privacy.aiDays"), t("settings.privacy.aiDaysHint"))}
          </Block>
        ) : null}
        {blocks.includes("retentionPlatform") ? (
          <Block icon={<Timer className="size-4 text-warn-ink" />} title={t("settings.privacy.retentionTitle")} hint={t("settings.privacy.retentionPlatformHint")}>
            {days("auditDays", t("settings.privacy.auditDays"), t("settings.privacy.auditDaysHint"))}
          </Block>
        ) : null}
        {blocks.includes("locations") ? (
          <div className="lg:col-span-3">
            <Block icon={<MapPin className="size-4 text-accent" />} title={t("settings.privacy.locationsTitle")} hint={t("settings.privacy.locationsHint")}>
              <div className="grid gap-3 md:grid-cols-2">
                {loaded.data.detected.map((entry) => (
                  <Field key={entry.component} label={`${entry.name} — ${entry.role}`} htmlFor={`location-${entry.component}`} hint={t("settings.privacy.detected", { value: entry.location })}>
                    <Input
                      id={`location-${entry.component}`}
                      value={state.profile.locations[entry.component] ?? ""}
                      placeholder={t("settings.privacy.locationPlaceholder")}
                      onChange={(event) => setLocation(entry.component, event.target.value)}
                    />
                  </Field>
                ))}
              </div>
            </Block>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
