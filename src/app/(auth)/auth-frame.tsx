import { KeyRound, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { getI18n } from "@/shared/i18n/server";
import { LocaleSwitcher } from "@/shared/ui/locale-switcher";
import { Logo } from "@/shared/ui/logo";
import { MapIllustration, illustrationLabels } from "@/shared/ui/map-illustration";
import { ThemeToggle } from "@/shared/ui/theme";

/** Sign-in and sign-up: the form on the left, the map idea on a dark panel on the right (wide screens). */
export async function AuthFrame({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  const { t } = await getI18n();
  const points = [
    { icon: KeyRound, text: t("auth.pointNoPasswords") },
    { icon: ShieldCheck, text: t("auth.pointPrivate") },
    { icon: Sparkles, text: t("auth.pointAssistant") },
  ];
  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-[1fr_1.1fr]">
      <main className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Link href="/" className="rounded-lg">
            <Logo />
          </Link>
          <div className="flex items-center gap-0.5">
            <ThemeToggle />
            <LocaleSwitcher />
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
          <p className="mt-2 text-sm text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <div className="mt-6 text-center text-[13px] text-muted">{footer}</div>
        </div>
        <Link href="/" className="mx-auto text-[13px] font-semibold text-muted hover:text-ink">
          ← {t("auth.backHome")}
        </Link>
      </main>
      <aside className="relative hidden overflow-hidden bg-rail p-12 lg:flex lg:flex-col lg:justify-center">
        <div className="bg-map-grid absolute inset-0 opacity-20" aria-hidden="true" />
        <div className="relative mx-auto w-full max-w-xl">
          <p className="text-[13px] font-bold uppercase tracking-wider text-primary">{t("auth.panelEyebrow")}</p>
          <h2 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-white">{t("auth.panelTitle")}</h2>
          <MapIllustration labels={illustrationLabels(t)} className="mt-8" />
          <ul className="mt-8 space-y-3">
            {points.map((point) => (
              <li key={point.text} className="flex items-center gap-3 text-sm text-white/80">
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white">
                  <point.icon className="size-4" />
                </span>
                {point.text}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
