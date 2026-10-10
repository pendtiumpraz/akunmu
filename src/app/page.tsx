import { AtSign, Command, Fingerprint, KeyRound, Laptop, Layers, ListChecks, Moon, ShieldCheck, Sparkles, Users, Waypoints, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { readStaffSession } from "@/modules/users/session";
import { getI18n } from "@/shared/i18n/server";
import { ButtonLink } from "@/shared/ui/button";
import { LocaleSwitcher } from "@/shared/ui/locale-switcher";
import { APP_NAME, Logo } from "@/shared/ui/logo";
import { MapIllustration, illustrationLabels } from "@/shared/ui/map-illustration";
import { ThemeToggle } from "@/shared/ui/theme";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: { absolute: `${APP_NAME} — ${t("landing.metaTitle")}` }, description: t("landing.metaDescription") };
}

function Feature({ icon: Icon, color, title, body }: { icon: LucideIcon; color: string; title: string; body: string }) {
  return (
    <div className="rounded-panel border border-line bg-surface p-5">
      <Icon className="size-5" style={{ color }} strokeWidth={2.2} />
      <h3 className="mt-3 text-[15px] font-bold text-ink">{title}</h3>
      <p className="mt-1.5 text-sm leading-6 text-muted">{body}</p>
    </div>
  );
}

/** The public landing page: what AkunMu is, how it works, and why it never holds passwords. */
export default async function LandingPage() {
  const [{ t }, staff] = await Promise.all([getI18n(), readStaffSession()]);
  const home = staff ? (staff.tenantId === null ? "/platform" : "/app") : null;
  const steps = [
    { icon: Laptop, title: t("landing.step1Title"), body: t("landing.step1Body") },
    { icon: Layers, title: t("landing.step2Title"), body: t("landing.step2Body") },
    { icon: AtSign, title: t("landing.step3Title"), body: t("landing.step3Body") },
  ];
  const features = [
    { icon: Waypoints, color: "#14B8A6", title: t("landing.featureMapTitle"), body: t("landing.featureMapBody") },
    { icon: Fingerprint, color: "#F59E0B", title: t("landing.featureWhereTitle"), body: t("landing.featureWhereBody") },
    { icon: ListChecks, color: "#EF4444", title: t("landing.featureCheckTitle"), body: t("landing.featureCheckBody") },
    { icon: Sparkles, color: "#EC4899", title: t("landing.featureAssistantTitle"), body: t("landing.featureAssistantBody") },
    { icon: Command, color: "#3B82F6", title: t("landing.featurePaletteTitle"), body: t("landing.featurePaletteBody") },
    { icon: Users, color: "#A855F7", title: t("landing.featureTeamTitle"), body: t("landing.featureTeamBody") },
  ];
  const privacy = [t("landing.privacyPoint1"), t("landing.privacyPoint2"), t("landing.privacyPoint3"), t("landing.privacyPoint4")];

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="rounded-lg">
            <Logo />
          </Link>
          <nav className="ml-6 hidden items-center gap-5 text-[13px] font-semibold text-muted md:flex">
            <a href="#how" className="hover:text-ink">
              {t("landing.navHow")}
            </a>
            <a href="#features" className="hover:text-ink">
              {t("landing.navFeatures")}
            </a>
            <a href="#privacy" className="hover:text-ink">
              {t("landing.navPrivacy")}
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <div className="hidden sm:block">
              <LocaleSwitcher />
            </div>
            {home ? (
              <ButtonLink href={home} size="sm">
                {t("landing.openApp")}
              </ButtonLink>
            ) : (
              <>
                <ButtonLink href="/login" variant="ghost" size="sm">
                  {t("landing.signIn")}
                </ButtonLink>
                <ButtonLink href="/signup" size="sm">
                  {t("landing.start")}
                </ButtonLink>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-rail">
        <div className="bg-map-grid absolute inset-0 opacity-15" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-white/80">
              <KeyRound className="size-3.5 text-primary" />
              {t("landing.eyebrow")}
            </p>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl">{t("landing.heroTitle")}</h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/70">{t("landing.heroBody")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href={home ?? "/signup"} size="lg">
                {home ? t("landing.openApp") : t("landing.start")}
              </ButtonLink>
              {!home ? (
                <ButtonLink href="/login" size="lg" variant="bare" className="border border-white/20 text-white hover:bg-white/10">
                  {t("landing.signIn")}
                </ButtonLink>
              ) : null}
            </div>
            <p className="mt-5 flex items-center gap-2 text-xs text-white/50">
              <ShieldCheck className="size-4" />
              {t("landing.heroNote")}
            </p>
          </div>
          <MapIllustration labels={illustrationLabels(t)} />
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 lg:py-20">
        <p className="text-xs font-bold uppercase tracking-wider text-accent">{t("landing.howEyebrow")}</p>
        <h2 className="mt-2 max-w-2xl text-3xl font-extrabold tracking-tight text-ink">{t("landing.howTitle")}</h2>
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="relative rounded-panel border border-line bg-surface p-5">
              <span className="font-mono text-xs font-bold text-faint">0{index + 1}</span>
              <step.icon className="mt-3 size-6 text-accent" />
              <h3 className="mt-3 text-base font-bold text-ink">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="features" className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 lg:py-20">
          <p className="text-xs font-bold uppercase tracking-wider text-accent">{t("landing.featuresEyebrow")}</p>
          <h2 className="mt-2 max-w-2xl text-3xl font-extrabold tracking-tight text-ink">{t("landing.featuresTitle")}</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <Feature key={feature.title} {...feature} />
            ))}
          </div>
          <p className="mt-6 flex items-center gap-2 text-[13px] text-muted">
            <Moon className="size-4" />
            {t("landing.featureThemes")}
          </p>
        </div>
      </section>

      <section id="privacy" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-accent">{t("landing.privacyEyebrow")}</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-ink">{t("landing.privacyTitle")}</h2>
            <p className="mt-4 text-sm leading-7 text-muted">{t("landing.privacyBody")}</p>
          </div>
          <ul className="space-y-3">
            {privacy.map((point) => (
              <li key={point} className="flex items-start gap-3 rounded-panel border border-line bg-surface px-4 py-3.5 text-sm text-ink-2">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ok" />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="relative overflow-hidden rounded-2xl bg-rail px-6 py-12 text-center sm:px-12">
          <div className="bg-map-grid absolute inset-0 opacity-15" aria-hidden="true" />
          <h2 className="relative text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{t("landing.ctaTitle")}</h2>
          <p className="relative mx-auto mt-3 max-w-lg text-sm text-white/70">{t("landing.ctaBody")}</p>
          <div className="relative mt-7 flex justify-center">
            <ButtonLink href={home ?? "/signup"} size="lg">
              {home ? t("landing.openApp") : t("landing.start")}
            </ButtonLink>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-muted sm:px-6">
          <Logo nameClassName="text-sm" />
          <div className="flex flex-wrap items-center gap-2">
            <LocaleSwitcher />
            <p>{t("landing.footer", { year: String(new Date().getFullYear()) })}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
