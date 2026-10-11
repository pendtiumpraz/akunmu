import {
  Command,
  Fingerprint,
  GitBranch,
  KeyRound,
  Leaf,
  ListChecks,
  Moon,
  ShieldCheck,
  Sparkles,
  Sprout,
  SquareTerminal,
  TreeDeciduous,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { readStaffSession } from "@/modules/users/session";
import { getI18n } from "@/shared/i18n/server";
import { ButtonLink } from "@/shared/ui/button";
import { LocaleSwitcher } from "@/shared/ui/locale-switcher";
import { APP_NAME, Logo } from "@/shared/ui/logo";
import { ThemeToggle } from "@/shared/ui/theme";
import { HERO_VIEW, heroTree } from "./_landing/hero-tree";
import { LandingMotion } from "./_landing/landing-motion";
import { ScreenFrame } from "./_landing/screen-frame";
import { Showcase } from "./_landing/showcase";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: { absolute: `${APP_NAME} — ${t("landing.metaTitle")}` }, description: t("landing.metaDescription") };
}

/** Screenshots exist for these languages (public/landing/*-<code>.webp); others show the English ones. */
const SHOT_LOCALES = new Set(["id", "en"]);

const delay = (milliseconds: number) => ({ "--delay": `${milliseconds}ms` }) as CSSProperties;

/**
 * The account tree behind the hero (hero-tree.ts): the trunk rises out of the screenshot to the root (bark), wires
 * branch out to junctions (ports, as in the app) and end in leaves; landing-motion.tsx grows it level by level.
 * Hidden on phones, where the text fills the width.
 */
function HeroTree() {
  const { nodes, wires } = heroTree();
  return (
    <svg
      viewBox={`0 0 ${HERO_VIEW.width} ${HERO_VIEW.height}`}
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 hidden h-[660px] w-full md:block"
    >
      {wires.map((wire) => (
        <path
          key={wire.id}
          d={wire.d}
          pathLength={1}
          data-branch
          data-depth={wire.depth}
          className="landing-branch"
          fill="none"
          stroke="rgb(255 255 255 / 0.13)"
          strokeWidth={wire.width}
          strokeLinecap="round"
        />
      ))}
      {nodes.map((node) => (
        <g key={node.id} data-bud data-depth={node.depth} className="landing-bud">
          {node.tip ? <circle data-bud-halo cx={node.x} cy={node.y} r={14} fill="var(--primary)" opacity={0.18} /> : null}
          <circle
            data-bud-core
            cx={node.x}
            cy={node.y}
            r={node.tip ? 5.5 : node.depth === 0 ? 5 : 3.5}
            fill={node.tip ? "var(--primary)" : node.depth === 0 ? "var(--bark)" : "rgb(255 255 255 / 0.45)"}
          />
        </g>
      ))}
    </svg>
  );
}

/** A label pointing at a spot of the hero screenshot (position in percent of the image). */
function Annotation({ x, y, wait, icon: Icon, text }: { x: string; y: string; wait: number; icon: LucideIcon; text: string }) {
  return (
    <span
      className="landing-pop absolute hidden items-center gap-1.5 whitespace-nowrap rounded-full border border-white/15 bg-trunk/95 px-3 py-1.5 text-xs font-semibold text-white shadow-float md:inline-flex"
      style={{ left: x, top: y, transform: "translate(-50%, -50%)", ...delay(wait) }}
    >
      <Icon className="size-3.5 text-primary" />
      {text}
    </span>
  );
}

function Feature({ icon: Icon, color, title, body }: { icon: LucideIcon; color: string; title: string; body: string }) {
  return (
    <div className="group h-full rounded-panel border border-line bg-surface p-5 transition duration-300 hover:-translate-y-1 hover:border-line-strong hover:shadow-float">
      <span className="inline-flex size-10 items-center justify-center rounded-xl bg-subtle transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
        <Icon className="size-5" style={{ color }} strokeWidth={2.2} />
      </span>
      <h3 className="mt-4 text-[15px] font-bold text-ink">{title}</h3>
      <p className="mt-1.5 text-sm leading-6 text-muted">{body}</p>
    </div>
  );
}

/** The public landing page: the account trees, how they grow, a tour of the app, and why it never holds passwords. */
export default async function LandingPage() {
  const [{ t, locale }, staff] = await Promise.all([getI18n(), readStaffSession()]);
  const home = staff ? (staff.tenantId === null ? "/platform" : "/app") : null;
  const shots = SHOT_LOCALES.has(locale) ? locale : "en";
  const steps = [
    { icon: Sprout, color: "var(--bark)", title: t("landing.step1Title"), body: t("landing.step1Body") },
    { icon: GitBranch, color: "var(--accent)", title: t("landing.step2Title"), body: t("landing.step2Body") },
    { icon: Leaf, color: "var(--ok)", title: t("landing.step3Title"), body: t("landing.step3Body") },
  ];
  const tour = [
    { key: "tree", title: t("landing.showTreeTitle"), body: t("landing.showTreeBody"), image: `/landing/tree-light-${shots}.webp`, alt: t("landing.shotTreeAlt") },
    { key: "columns", title: t("landing.showColumnsTitle"), body: t("landing.showColumnsBody"), image: `/landing/columns-${shots}.webp`, alt: t("landing.shotColumnsAlt") },
    { key: "check", title: t("landing.showCheckTitle"), body: t("landing.showCheckBody"), image: `/landing/check-${shots}.webp`, alt: t("landing.shotCheckAlt") },
    { key: "assistant", title: t("landing.showAssistantTitle"), body: t("landing.showAssistantBody"), image: `/landing/assistant-${shots}.webp`, alt: t("landing.shotAssistantAlt") },
  ];
  const features = [
    { icon: TreeDeciduous, color: "#34D399", title: t("landing.featureMapTitle"), body: t("landing.featureMapBody") },
    { icon: Fingerprint, color: "#F59E0B", title: t("landing.featureWhereTitle"), body: t("landing.featureWhereBody") },
    { icon: ListChecks, color: "#EF4444", title: t("landing.featureCheckTitle"), body: t("landing.featureCheckBody") },
    { icon: Sparkles, color: "#EC4899", title: t("landing.featureAssistantTitle"), body: t("landing.featureAssistantBody") },
    { icon: Command, color: "#3B82F6", title: t("landing.featurePaletteTitle"), body: t("landing.featurePaletteBody") },
    { icon: Users, color: "#A855F7", title: t("landing.featureTeamTitle"), body: t("landing.featureTeamBody") },
  ];
  const privacy = [t("landing.privacyPoint1"), t("landing.privacyPoint2"), t("landing.privacyPoint3"), t("landing.privacyPoint4")];
  const start = home ?? "/signup";

  return (
    <div className="min-h-dvh bg-canvas">
      <LandingMotion />
      <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="rounded-lg">
            <Logo />
          </Link>
          <nav className="ml-6 hidden items-center gap-5 text-[13px] font-semibold text-muted md:flex">
            <a href="#how" className="hover:text-ink">
              {t("landing.navHow")}
            </a>
            <a href="#tour" className="hover:text-ink">
              {t("landing.navTour")}
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
        <HeroTree />
        <div className="absolute inset-x-0 bottom-0 h-[26%] bg-canvas sm:h-[34%]" aria-hidden="true" />
        <div className="relative mx-auto max-w-4xl px-4 pt-14 text-center sm:px-6 lg:pt-20">
          <p className="landing-rise inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80" style={delay(0)}>
            <Sprout className="size-3.5 text-primary" />
            {t("landing.eyebrow")}
          </p>
          <h1 className="landing-rise mx-auto mt-5 max-w-3xl text-4xl font-extrabold leading-[1.06] tracking-tight text-white sm:text-6xl" style={delay(90)}>
            {t("landing.heroTitle")}
          </h1>
          <p className="landing-rise mx-auto mt-5 max-w-2xl text-base leading-7 text-white/70 sm:text-lg sm:leading-8" style={delay(180)}>
            {t("landing.heroBody")}
          </p>
          <div className="landing-rise mt-8 flex flex-wrap justify-center gap-3" style={delay(270)}>
            <span data-magnetic className="inline-block">
              <ButtonLink href={start} size="lg">
                {home ? t("landing.openApp") : t("landing.start")}
              </ButtonLink>
            </span>
            {!home ? (
              <ButtonLink href="/login" size="lg" variant="bare" className="border border-white/20 text-white hover:bg-white/10">
                {t("landing.signIn")}
              </ButtonLink>
            ) : null}
          </div>
          <p className="landing-rise mt-5 flex items-center justify-center gap-2 text-xs text-white/50" style={delay(360)}>
            <ShieldCheck className="size-4" />
            {t("landing.heroNote")}
          </p>
        </div>
        <div className="relative mx-auto mt-12 max-w-6xl px-4 pb-6 [perspective:1800px] sm:px-6">
          <div data-hero-shot className="origin-bottom">
            <div data-tilt className="landing-rise [perspective:1800px]" style={delay(420)}>
              <div className="[transform-style:preserve-3d]">
                <ScreenFrame src={`/landing/tree-dark-${shots}.webp`} alt={t("landing.shotTreeAlt")} tone="dark" priority>
                  <Annotation x="52%" y="44%" wait={1300} icon={Sprout} text={t("landing.heroAnnotRoot")} />
                  <Annotation x="65%" y="57%" wait={1650} icon={KeyRound} text={t("landing.heroAnnotBranch")} />
                  <Annotation x="80%" y="27%" wait={2000} icon={SquareTerminal} text={t("landing.heroAnnotLeaf")} />
                </ScreenFrame>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 lg:py-24">
        <div data-reveal>
          <p className="text-xs font-bold uppercase tracking-wider text-accent">{t("landing.howEyebrow")}</p>
          <h2 className="mt-2 max-w-2xl text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{t("landing.howTitle")}</h2>
        </div>
        {/* The motion moves the plain list items; the cards inside keep their own hover transitions. */}
        <ol data-stagger className="relative mt-12 grid gap-4 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title}>
              <div className="group relative h-full rounded-panel border border-line bg-surface p-6 transition duration-300 hover:-translate-y-1 hover:shadow-float">
                <div className="flex items-center justify-between">
                  <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-subtle transition-transform duration-300 group-hover:scale-110">
                    <step.icon className="size-5" style={{ color: step.color }} strokeWidth={2.2} />
                  </span>
                  <span className="font-mono text-xs font-bold text-faint">0{index + 1}</span>
                </div>
                <h3 className="mt-5 text-lg font-bold text-ink">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section id="tour" className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 lg:py-24">
          <div data-reveal>
            <p className="text-xs font-bold uppercase tracking-wider text-accent">{t("landing.showcaseEyebrow")}</p>
            <h2 className="mt-2 max-w-2xl text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{t("landing.showcaseTitle")}</h2>
          </div>
          <div className="mt-10">
            <Showcase items={tour} />
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 lg:py-24">
        <div data-reveal>
          <p className="text-xs font-bold uppercase tracking-wider text-accent">{t("landing.featuresEyebrow")}</p>
          <h2 className="mt-2 max-w-2xl text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{t("landing.featuresTitle")}</h2>
        </div>
        <div data-stagger className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title}>
              <Feature {...feature} />
            </div>
          ))}
        </div>
        <p className="mt-6 flex items-center gap-2 text-[13px] text-muted">
          <Moon className="size-4" />
          {t("landing.featureThemes")}
        </p>
      </section>

      <section id="privacy" className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div data-reveal>
              <p className="text-xs font-bold uppercase tracking-wider text-accent">{t("landing.privacyEyebrow")}</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{t("landing.privacyTitle")}</h2>
              <p className="mt-4 text-sm leading-7 text-muted">{t("landing.privacyBody")}</p>
            </div>
            <ul data-stagger className="space-y-3">
              {privacy.map((point) => (
                <li key={point} className="flex items-start gap-3 rounded-panel border border-line bg-canvas px-4 py-3.5 text-sm text-ink-2">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ok" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div data-reveal className="relative overflow-hidden rounded-3xl bg-rail px-6 py-14 text-center sm:px-12">
          <svg viewBox="0 0 800 220" preserveAspectRatio="xMidYMax slice" aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-full w-full">
            <path d="M400 240 C400 190 398 160 400 120 M400 170 C340 150 280 140 230 100 M400 150 C460 130 520 124 572 88" fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth={2} strokeLinecap="round" />
            <circle cx={230} cy={100} r={5} fill="var(--primary)" opacity={0.6} />
            <circle cx={572} cy={88} r={5} fill="var(--primary)" opacity={0.6} />
            <circle cx={400} cy={120} r={4} fill="var(--primary)" opacity={0.6} />
          </svg>
          <TreeDeciduous className="relative mx-auto size-9 text-primary" />
          <h2 className="relative mt-4 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{t("landing.ctaTitle")}</h2>
          <p className="relative mx-auto mt-3 max-w-lg text-sm text-white/70">{t("landing.ctaBody")}</p>
          <div className="relative mt-7 flex justify-center">
            <span data-magnetic className="inline-block">
              <ButtonLink href={start} size="lg">
                {home ? t("landing.openApp") : t("landing.start")}
              </ButtonLink>
            </span>
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
