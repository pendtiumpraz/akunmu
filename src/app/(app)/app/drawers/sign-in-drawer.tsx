"use client";

import { CalendarCheck, Check, MonitorSmartphone, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { isCliTool } from "@/modules/devices/types";
import { APP_KINDS, APPROVAL_METHODS, type AppKind, type ApprovalMethod } from "@/modules/signins/types";
import { api, firstFieldErrors, type Paginated } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { Drawer } from "@/shared/ui/drawer";
import { Checkbox, Field, Input, Select, Textarea } from "@/shared/ui/form-controls";
import { useToast } from "@/shared/ui/toast";
import { useApi } from "@/shared/ui/use-api";
import type { AccountDetail, AccountListItem, MapData, PlaceKey, ProviderItem } from "../map-types";
import { APPROVAL_ICONS, AppMark, ProfileMark, ProviderAvatar, placeLabel, profileClientLabel } from "../ui";
import { ProviderPicker, providerForSave } from "./provider-picker";

export type FixedAccount = { id: number; identifier: string; label: string | null; provider: { id: number; name: string; color: string; slug?: string } };

/** An existing sign-in being corrected (its account and device stay). */
export type SignInEdit = {
  id: number;
  account: FixedAccount;
  deviceId: number;
  place: PlaceKey;
  app: string | null;
  appKind: AppKind | null;
  approvedFromId: number | null;
  approvalMethod: ApprovalMethod | null;
  since: string | null;
  review: boolean;
  notes: string | null;
};

type Draft = {
  providerId: number | null;
  identifier: string;
  deviceId: number | null;
  place: PlaceKey | null;
  app: string;
  appKind: AppKind;
  approvedFromId: number | null;
  approvalMethod: ApprovalMethod | null;
  since: string;
  review: boolean;
  notes: string;
};

function todayLocal(): string {
  return new Date().toLocaleDateString("en-CA");
}

/**
 * Records an account as signed in at a place, or corrects one. Context from the screen (device, place, account)
 * fills the form. The account is picked by provider and identifier: an existing one is reused, a new one is added.
 * Render it only while open.
 */
export function SignInDrawer({
  deviceId,
  place,
  account,
  edit,
  onClose,
  onSaved,
}: {
  deviceId?: number | null;
  place?: PlaceKey | null;
  account?: FixedAccount | null;
  edit?: SignInEdit | null;
  onClose: () => void;
  onSaved: (signIn: { id: number; device: { id: number }; profile: { id: number } | null; app: string | null; account: { id: number } }) => void;
}) {
  const { t } = useI18n();
  const notify = useToast();
  const map = useApi<MapData>("/api/map");
  const providers = useApi<ProviderItem[]>(edit || account ? null : "/api/providers");
  const fixedAccount = edit?.account ?? account ?? null;
  const [draft, setDraft] = useState<Draft>(() => ({
    providerId: null,
    identifier: "",
    deviceId: edit?.deviceId ?? deviceId ?? null,
    place: edit?.place ?? place ?? null,
    app: edit?.app ?? (place?.startsWith("a:") ? place.slice(2) : ""),
    appKind: edit?.appKind ?? "app",
    approvedFromId: edit?.approvedFromId ?? null,
    approvalMethod: edit?.approvalMethod ?? null,
    since: edit?.since ?? "",
    review: edit?.review ?? false,
    notes: edit?.notes ?? "",
  }));
  // The name of a provider to add, typed under the picker; made when the sign-in is recorded.
  const [newProvider, setNewProvider] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [lookup, setLookup] = useState("");

  const set = <Key extends keyof Draft>(key: Key, value: Draft[Key]) => setDraft((current) => ({ ...current, [key]: value }));

  // A Claude Code profile signs in to Claude: that provider is chosen until another one is picked.
  const placeProfile = draft.place?.startsWith("p:") ? (map.data?.profiles ?? []).find((profile) => `p:${profile.id}` === draft.place) : undefined;
  const defaultProviderId =
    placeProfile && isCliTool(placeProfile.browser) && newProvider === null ? (providers.data?.find((item) => item.slug === "claude")?.id ?? null) : null;
  const providerId = draft.providerId ?? defaultProviderId;

  // Suggestions follow the identifier as it is typed (debounced).
  useEffect(() => {
    const timer = window.setTimeout(() => setLookup(draft.identifier.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [draft.identifier]);
  const suggestionPath =
    !fixedAccount && providerId ? `/api/accounts?${new URLSearchParams({ provider: String(providerId), per_page: "6", ...(lookup ? { search: lookup } : {}) })}` : null;
  const suggestions = useApi<Paginated<AccountListItem>>(suggestionPath);
  // Only the chosen provider's accounts count: a provider being added has none (older suggestions may linger).
  const exact = suggestionPath ? (suggestions.data?.items.find((item) => item.identifier.toLowerCase() === draft.identifier.trim().toLowerCase()) ?? null) : null;

  const devices = map.data?.devices ?? [];
  // Browser profiles first, then command-line profiles.
  const profiles = (map.data?.profiles ?? [])
    .filter((profile) => profile.deviceId === draft.deviceId)
    .sort((a, b) => Number(isCliTool(a.browser)) - Number(isCliTool(b.browser)));
  const apps = [
    ...new Set(
      (map.data?.signIns ?? [])
        .filter((row) => row.device.id === draft.deviceId && !row.profile && row.app)
        .map((row) => row.app as string),
    ),
  ];
  const onDevice = draft.place === "d" || Boolean(draft.place?.startsWith("a:"));

  // Where the account grew from: one of its other sign-ins (an existing account only), except this one and those
  // grown from it, which would make a loop.
  const originAccountId = fixedAccount?.id ?? exact?.id ?? null;
  const originAccount = useApi<AccountDetail>(originAccountId ? `/api/accounts/${originAccountId}` : null);
  const grownFromThis = new Set<number>(edit ? [edit.id] : []);
  for (let changed = true; changed; ) {
    changed = false;
    for (const row of originAccount.data?.signIns ?? []) {
      if (row.approvedFromId !== null && grownFromThis.has(row.approvedFromId) && !grownFromThis.has(row.id)) {
        grownFromThis.add(row.id);
        changed = true;
      }
    }
  }
  const originOptions = (originAccount.data?.signIns ?? []).filter((row) => !grownFromThis.has(row.id));
  const approvedFromId = originOptions.some((row) => row.id === draft.approvedFromId) ? draft.approvedFromId : null;

  const save = async () => {
    setSaving(true);
    setErrors({});
    const profileId = draft.place?.startsWith("p:") ? Number(draft.place.slice(2)) : null;
    const app = onDevice ? draft.app.trim() : "";
    const origin = { appKind: app ? draft.appKind : null, approvedFromId, approvalMethod: approvedFromId ? draft.approvalMethod : null };
    try {
      if (!draft.place) {
        setErrors({ profileId: t("signIns.choosePlace") });
        return;
      }
      if (edit) {
        const result = await api<{ id: number; device: { id: number }; profile: { id: number } | null; app: string | null; account: { id: number } }>(
          `/api/sign-ins/${edit.id}`,
          { method: "PATCH", body: { profileId, app, ...origin, since: draft.since, review: draft.review, notes: draft.notes } },
        );
        notify(result.message);
        onSaved(result.data);
        return;
      }
      let savedProviderId = providerId;
      if (!fixedAccount && newProvider !== null) {
        if (!newProvider.trim()) {
          setErrors({ newProvider: t("validation.required") });
          return;
        }
        try {
          savedProviderId = await providerForSave({ providerId: null, newName: newProvider }, providers.data ?? []);
        } catch (error) {
          const fields = firstFieldErrors(error);
          setErrors({ newProvider: fields.name ?? (error instanceof Error && error.message ? error.message : t("common.saveFailed")) });
          return;
        }
        // Made (or found) now, so trying again does not make it twice.
        setNewProvider(null);
        set("providerId", savedProviderId);
        providers.reload();
      }
      const accountPart = fixedAccount
        ? { accountId: fixedAccount.id }
        : exact
          ? { accountId: exact.id }
          : { providerId: savedProviderId, identifier: draft.identifier };
      const result = await api<{ id: number; device: { id: number }; profile: { id: number } | null; app: string | null; account: { id: number } }>("/api/sign-ins", {
        method: "POST",
        body: { ...accountPart, deviceId: draft.deviceId, profileId, app, ...origin, since: draft.since, review: draft.review, notes: draft.notes },
      });
      notify(result.message);
      onSaved(result.data);
    } catch (error) {
      setErrors(firstFieldErrors(error));
      notify(error instanceof Error && error.message ? error.message : t("common.saveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={edit ? t("signIns.editTitle") : t("signIns.recordTitle")}
      description={t("signIns.drawerHint")}
      closeLabel={t("common.close")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} loading={saving}>
            {edit ? t("common.save") : t("signIns.recordButton")}
          </Button>
        </>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <section className="space-y-3">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-faint">{t("signIns.stepAccount")}</h3>
          {fixedAccount ? (
            <div className="flex items-center gap-3 rounded-xl border border-line bg-subtle p-3">
              <ProviderAvatar provider={fixedAccount.provider} />
              <div className="min-w-0">
                <p className="truncate font-mono text-[13px] font-semibold text-ink">{fixedAccount.identifier}</p>
                <p className="truncate text-xs text-muted">{[fixedAccount.provider.name, fixedAccount.label].filter(Boolean).join(" · ")}</p>
              </div>
            </div>
          ) : (
            <>
              <Field label={t("accounts.fieldProvider")} htmlFor="signin-provider" required error={errors.providerId}>
                <ProviderPicker
                  id="signin-provider"
                  providers={providers.data ?? []}
                  value={{ providerId, newName: newProvider }}
                  onChange={(choice) => {
                    set("providerId", choice.providerId);
                    setNewProvider(choice.newName);
                  }}
                  invalid={Boolean(errors.providerId)}
                  newNameError={errors.newProvider}
                />
              </Field>
              <Field
                label={t("accounts.fieldIdentifier")}
                htmlFor="signin-identifier"
                required
                error={errors.identifier ?? errors.accountId}
                hint={draft.identifier.trim() && (providerId || newProvider !== null) ? (exact ? t("signIns.existingAccount") : t("signIns.newAccount")) : t("accounts.identifierHint")}
              >
                <Input
                  id="signin-identifier"
                  value={draft.identifier}
                  maxLength={200}
                  onChange={(event) => set("identifier", event.target.value)}
                  invalid={Boolean(errors.identifier)}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={!providerId && newProvider === null}
                  className="font-mono text-[13px]"
                />
              </Field>
              {providerId && (suggestions.data?.items.length ?? 0) > 0 && !exact ? (
                <ul className="-mt-1 overflow-hidden rounded-lg border border-line" aria-label={t("signIns.suggestions")}>
                  {suggestions.data?.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => set("identifier", item.identifier)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-subtle"
                      >
                        <ProviderAvatar provider={item.provider} size="sm" />
                        <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink">{item.identifier}</span>
                        {item.label ? <span className="truncate text-xs text-muted">{item.label}</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-faint">{t("signIns.stepPlace")}</h3>
          <Field label={t("signIns.fieldDevice")} htmlFor="signin-device" required error={errors.deviceId}>
            <Select
              id="signin-device"
              value={draft.deviceId ?? ""}
              disabled={Boolean(edit)}
              onChange={(event) => {
                set("deviceId", event.target.value ? Number(event.target.value) : null);
                set("place", null);
              }}
              invalid={Boolean(errors.deviceId)}
            >
              <option value="">{t("signIns.chooseDevice")}</option>
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name}
                </option>
              ))}
            </Select>
          </Field>
          {draft.deviceId ? (
            <div role="radiogroup" aria-label={t("signIns.fieldPlace")} className="space-y-1.5">
              {profiles.map((profile) => {
                const key = `p:${profile.id}`;
                const selected = draft.place === key;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => set("place", key)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                      selected ? "border-accent bg-accent-soft" : "border-line hover:bg-subtle",
                    )}
                  >
                    <ProfileMark client={profile.browser} color={profile.color} />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-sm font-semibold text-ink", isCliTool(profile.browser) && "font-mono")}>{profile.name}</span>
                      <span className="block text-xs text-muted">{profileClientLabel(profile.browser, t)}</span>
                    </span>
                    {selected ? <Check className="size-4 text-accent" /> : null}
                  </button>
                );
              })}
              <button
                type="button"
                role="radio"
                aria-checked={onDevice}
                onClick={() => set("place", draft.app.trim() ? `a:${draft.app.trim().toLowerCase()}` : "d")}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                  onDevice ? "border-accent bg-accent-soft" : "border-line hover:bg-subtle",
                )}
              >
                <span className="inline-flex size-7 items-center justify-center rounded-lg bg-sunken text-ink-2">
                  <MonitorSmartphone className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{t("signIns.onDevice")}</span>
                  <span className="block text-xs text-muted">{t("signIns.onDeviceHint")}</span>
                </span>
                {onDevice ? <Check className="size-4 text-accent" /> : null}
              </button>
              {profiles.length === 0 ? <p className="px-1 text-xs text-muted">{t("signIns.noProfilesHint")}</p> : null}
              {errors.profileId ? <p className="text-xs text-danger-ink">{errors.profileId}</p> : null}
            </div>
          ) : null}
          {onDevice ? (
            <Field label={t("signIns.fieldApp")} htmlFor="signin-app" optionalLabel={t("common.optional")} error={errors.app} hint={t("signIns.appHint")}>
              <Input id="signin-app" value={draft.app} maxLength={60} list="signin-app-options" onChange={(event) => set("app", event.target.value)} />
              <datalist id="signin-app-options">
                {apps.map((app) => (
                  <option key={app} value={app} />
                ))}
              </datalist>
            </Field>
          ) : null}
          {onDevice && draft.app.trim() ? (
            <div role="radiogroup" aria-label={t("signIns.fieldAppKind")} className="grid grid-cols-2 gap-1.5">
              {APP_KINDS.map((kind) => {
                const selected = draft.appKind === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => set("appKind", kind)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left text-[13px] font-semibold transition-colors",
                      selected ? "border-accent bg-accent-soft text-ink" : "border-line text-ink-2 hover:bg-subtle",
                    )}
                  >
                    <AppMark kind={kind} className="size-6" />
                    {t.dynamic(`signIns.appKind_${kind}`)}
                  </button>
                );
              })}
            </div>
          ) : null}
        </section>

        <section className="space-y-3">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-faint">{t("signIns.stepOrigin")}</h3>
          {originAccountId === null ? (
            <p className="rounded-lg bg-subtle px-3 py-2 text-xs text-muted">
              {providerId && draft.identifier.trim() ? t("signIns.originNewAccount") : t("signIns.originPickAccount")}
            </p>
          ) : (
            <>
              <Field label={t("signIns.fieldOrigin")} htmlFor="signin-origin" hint={t("signIns.originHint")} error={errors.approvedFromId}>
                <Select
                  id="signin-origin"
                  value={approvedFromId ?? ""}
                  onChange={(event) => set("approvedFromId", event.target.value ? Number(event.target.value) : null)}
                  invalid={Boolean(errors.approvedFromId)}
                >
                  <option value="">{t("signIns.originDirect")}</option>
                  {originOptions.map((row) => (
                    <option key={row.id} value={row.id}>
                      {[row.device.name, placeLabel(row, t), row.status === "signed_out" ? t("signIns.signedOutStatus") : null].filter(Boolean).join(" · ")}
                    </option>
                  ))}
                </Select>
              </Field>
              {approvedFromId ? (
                <div role="radiogroup" aria-label={t("signIns.fieldApprovalMethod")} className="grid grid-cols-2 gap-1.5">
                  {APPROVAL_METHODS.map((method) => {
                    const Icon = APPROVAL_ICONS[method];
                    const selected = draft.approvalMethod === method;
                    return (
                      <button
                        key={method}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => set("approvalMethod", selected ? null : method)}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[13px] font-semibold transition-colors",
                          selected ? "border-accent bg-accent-soft text-ink" : "border-line text-ink-2 hover:bg-subtle",
                        )}
                      >
                        <Icon className={cn("size-4 shrink-0", selected ? "text-accent" : "text-muted")} />
                        {t.dynamic(`signIns.approvalLong_${method}`)}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-faint">{t("signIns.stepDetails")}</h3>
          <Field label={t("signIns.fieldSince")} htmlFor="signin-since" optionalLabel={t("common.optional")} error={errors.since}>
            <div className="flex gap-2">
              <Input id="signin-since" type="date" value={draft.since} onChange={(event) => set("since", event.target.value)} className="flex-1" />
              <Button variant="secondary" icon={<CalendarCheck className="size-4" />} onClick={() => set("since", todayLocal())}>
                {t("signIns.today")}
              </Button>
            </div>
          </Field>
          <Checkbox label={t("signIns.reviewLabel")} description={t("signIns.reviewHint")} checked={draft.review} onChange={(event) => set("review", event.target.checked)} />
          <Field label={t("signIns.fieldNotes")} htmlFor="signin-notes" optionalLabel={t("common.optional")} error={errors.notes} hint={t("common.noSecretsHint")}>
            <Textarea id="signin-notes" value={draft.notes} maxLength={1000} onChange={(event) => set("notes", event.target.value)} />
          </Field>
        </section>
        {!edit && !fixedAccount ? (
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Plus className="size-3.5" />
            {t("signIns.autoAccountHint")}
          </p>
        ) : null}
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Drawer>
  );
}
