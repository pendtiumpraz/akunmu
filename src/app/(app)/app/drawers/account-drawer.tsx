"use client";

import { ShieldCheck, ShieldOff, ShieldQuestion } from "lucide-react";
import { useState } from "react";
import { TWO_FACTOR_STATES, type TwoFactorState } from "@/modules/accounts/types";
import { api, firstFieldErrors } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { Button } from "@/shared/ui/button";
import { Drawer } from "@/shared/ui/drawer";
import { Field, Input, Segmented, Textarea } from "@/shared/ui/form-controls";
import { useToast } from "@/shared/ui/toast";
import { useApi } from "@/shared/ui/use-api";
import type { ProviderItem } from "../map-types";
import { ProviderPicker, providerForSave } from "./provider-picker";

export type AccountDraft = { id?: number; providerId: number | null; identifier: string; label: string | null; twoFactor: TwoFactorState; notes: string | null };

const EMPTY: AccountDraft = { providerId: null, identifier: "", label: null, twoFactor: "unknown", notes: null };

export const TWO_FACTOR_ICONS = { on: ShieldCheck, off: ShieldOff, unknown: ShieldQuestion } as const;

/** Add or edit an account (provider + the name it signs in with). Render it only while open. */
export function AccountDrawer({ account, onClose, onSaved }: { account: AccountDraft | null; onClose: () => void; onSaved: (account: { id: number }) => void }) {
  const { t } = useI18n();
  const notify = useToast();
  const providers = useApi<ProviderItem[]>("/api/providers");
  const [draft, setDraft] = useState<AccountDraft>(account ?? EMPTY);
  // The name of a provider to add, typed under the picker; made when the account is saved.
  const [newProvider, setNewProvider] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const set = <Key extends keyof AccountDraft>(key: Key, value: AccountDraft[Key]) => setDraft((current) => ({ ...current, [key]: value }));

  /** The provider to save with, making the new one first; null (with the error shown) when it cannot be made. */
  const resolveProvider = async (): Promise<number | null | false> => {
    if (newProvider === null) return draft.providerId;
    if (!newProvider.trim()) {
      setErrors({ newProvider: t("validation.required") });
      return false;
    }
    try {
      const providerId = await providerForSave({ providerId: null, newName: newProvider }, providers.data ?? []);
      setNewProvider(null);
      set("providerId", providerId);
      providers.reload();
      return providerId;
    } catch (error) {
      const fields = firstFieldErrors(error);
      setErrors({ newProvider: fields.name ?? (error instanceof Error && error.message ? error.message : t("common.saveFailed")) });
      return false;
    }
  };

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const providerId = await resolveProvider();
      if (providerId === false) return;
      const body = { providerId, identifier: draft.identifier, label: draft.label ?? "", twoFactor: draft.twoFactor, notes: draft.notes ?? "" };
      const result = account?.id
        ? await api<{ id: number }>(`/api/accounts/${account.id}`, { method: "PATCH", body })
        : await api<{ id: number }>("/api/accounts", { method: "POST", body });
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
      title={account?.id ? t("accounts.editTitle") : t("accounts.addTitle")}
      description={t("accounts.drawerHint")}
      closeLabel={t("common.close")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} loading={saving}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Field label={t("accounts.fieldProvider")} htmlFor="account-provider" required error={errors.providerId}>
          <ProviderPicker
            id="account-provider"
            providers={providers.data ?? []}
            value={{ providerId: draft.providerId, newName: newProvider }}
            onChange={(choice) => {
              set("providerId", choice.providerId);
              setNewProvider(choice.newName);
            }}
            invalid={Boolean(errors.providerId)}
            newNameError={errors.newProvider}
          />
        </Field>
        <Field label={t("accounts.fieldIdentifier")} htmlFor="account-identifier" required error={errors.identifier} hint={t("accounts.identifierHint")}>
          <Input
            id="account-identifier"
            value={draft.identifier}
            maxLength={200}
            onChange={(event) => set("identifier", event.target.value)}
            invalid={Boolean(errors.identifier)}
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-[13px]"
          />
        </Field>
        <Field label={t("accounts.fieldLabel")} htmlFor="account-label" optionalLabel={t("common.optional")} error={errors.label} hint={t("accounts.labelHint")}>
          <Input id="account-label" value={draft.label ?? ""} maxLength={60} onChange={(event) => set("label", event.target.value)} />
        </Field>
        <Field label={t("accounts.fieldTwoFactor")} error={errors.twoFactor}>
          <Segmented
            label={t("accounts.fieldTwoFactor")}
            value={draft.twoFactor}
            onChange={(value) => set("twoFactor", value)}
            options={TWO_FACTOR_STATES.map((state) => {
              const Icon = TWO_FACTOR_ICONS[state];
              return { value: state, label: t.dynamic(`accounts.twoFactor_${state}`), icon: <Icon className="size-3.5" /> };
            })}
          />
        </Field>
        <Field label={t("accounts.fieldNotes")} htmlFor="account-notes" optionalLabel={t("common.optional")} error={errors.notes} hint={t("common.noSecretsHint")}>
          <Textarea id="account-notes" value={draft.notes ?? ""} maxLength={1000} onChange={(event) => set("notes", event.target.value)} />
        </Field>
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Drawer>
  );
}
