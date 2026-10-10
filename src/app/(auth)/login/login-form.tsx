"use client";

import { Eye, EyeOff, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiClientError } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { Button } from "@/shared/ui/button";
import { Alert } from "@/shared/ui/feedback";
import { Field, Input } from "@/shared/ui/form-controls";

export function StaffLoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({});
    try {
      await api("/api/auth/login", { body: { email, password } });
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
    <form onSubmit={submit} noValidate className="space-y-5">
      <Field label={t("auth.email")} htmlFor="email" error={fieldErrors.email}>
        <Input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} invalid={Boolean(fieldErrors.email)} className="h-11" required />
      </Field>
      <Field label={t("auth.password")} htmlFor="password" error={fieldErrors.password}>
        <div className="relative">
          <Input
            id="password"
            type={visible ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            invalid={Boolean(fieldErrors.password)}
            className="h-11 pr-11"
            required
          />
          <button
            type="button"
            onClick={() => setVisible((value) => !value)}
            aria-label={visible ? t("auth.hidePassword") : t("auth.showPassword")}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-faint hover:text-ink"
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button type="submit" size="lg" className="w-full" loading={loading} icon={loading ? undefined : <LogIn className="size-5" />}>
        {t("auth.submit")}
      </Button>
    </form>
  );
}
