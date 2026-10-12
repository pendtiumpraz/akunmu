"use client";

import { Eye, EyeOff, KeyRound, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiClientError } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { Button } from "@/shared/ui/button";
import { Alert } from "@/shared/ui/feedback";
import { Checkbox, Field, Input } from "@/shared/ui/form-controls";

/** Accepting the terms and privacy policy is required; product news is a separate choice (PP 33/2026 Art. 33). */
type SignupState = { workspace: string; name: string; email: string; password: string; acceptTerms: boolean; marketing: boolean };

const EMPTY: SignupState = { workspace: "", name: "", email: "", password: "", acceptTerms: false, marketing: false };

/** Workspace sign-up: the workspace's name, then the first admin (who is signed in right away). */
export function SignupForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [state, setState] = useState<SignupState>(EMPTY);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof SignupState>(key: K, value: SignupState[K]) => setState((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({});
    try {
      await api("/api/public/signup", { body: state });
      router.push("/app");
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setFieldErrors(Object.fromEntries(Object.entries(caught.fieldErrors).map(([key, messages]) => [key, messages[0] ?? ""])));
        setError(caught.message || t("common.requestFailed"));
      } else {
        setError(t("common.requestFailed"));
      }
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label={t("signup.workspace")} htmlFor="workspace" hint={t("signup.workspaceHint")} error={fieldErrors.workspace}>
        <Input id="workspace" value={state.workspace} onChange={(event) => set("workspace", event.target.value)} invalid={Boolean(fieldErrors.workspace)} className="h-10" required />
      </Field>
      <Field label={t("signup.name")} htmlFor="name" error={fieldErrors.name}>
        <Input id="name" autoComplete="name" value={state.name} onChange={(event) => set("name", event.target.value)} invalid={Boolean(fieldErrors.name)} className="h-10" required />
      </Field>
      <Field label={t("signup.email")} htmlFor="email" error={fieldErrors.email}>
        <Input id="email" type="email" autoComplete="email" value={state.email} onChange={(event) => set("email", event.target.value)} invalid={Boolean(fieldErrors.email)} className="h-10" required />
      </Field>
      <Field label={t("signup.password")} htmlFor="password" hint={t("signup.passwordHint")} error={fieldErrors.password}>
        <div className="relative">
          <Input
            id="password"
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            value={state.password}
            onChange={(event) => set("password", event.target.value)}
            invalid={Boolean(fieldErrors.password)}
            className="h-10 pr-10"
            required
          />
          <button
            type="button"
            onClick={() => setVisible((value) => !value)}
            aria-label={visible ? t("auth.hidePassword") : t("auth.showPassword")}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-faint hover:text-ink"
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>
      <div className="space-y-3 rounded-lg border border-line bg-surface p-3">
        <Checkbox
          checked={state.acceptTerms}
          onChange={(event) => set("acceptTerms", event.target.checked)}
          label={
            <span className="font-normal text-ink-2">
              {t("signup.acceptBefore")}{" "}
              <Link href="/legal/terms" target="_blank" className="font-semibold text-accent hover:underline">
                {t("legal.terms")}
              </Link>{" "}
              {t("signup.acceptAnd")}{" "}
              <Link href="/legal/privacy" target="_blank" className="font-semibold text-accent hover:underline">
                {t("legal.privacy")}
              </Link>
              {t("signup.acceptAfter")}
            </span>
          }
          description={fieldErrors.acceptTerms ? <span className="text-danger-ink">{fieldErrors.acceptTerms}</span> : undefined}
        />
        <Checkbox
          checked={state.marketing}
          onChange={(event) => set("marketing", event.target.checked)}
          label={<span className="font-normal text-ink-2">{t("signup.marketing")}</span>}
        />
      </div>
      <p className="flex items-start gap-2 rounded-lg bg-accent-soft px-3 py-2.5 text-xs leading-5 text-accent">
        <KeyRound className="mt-0.5 size-3.5 shrink-0" />
        {t("signup.noPasswordsNote")}
      </p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!state.acceptTerms} icon={loading ? undefined : <UserPlus className="size-5" />}>
        {t("signup.submit")}
      </Button>
    </form>
  );
}
