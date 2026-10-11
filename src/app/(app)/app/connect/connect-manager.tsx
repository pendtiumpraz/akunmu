"use client";

import { ArrowUpRight, Download, ShieldCheck } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import type { Downloads } from "@/modules/connect/downloads";
import { useI18n } from "@/shared/i18n/client";
import { buttonClasses } from "@/shared/ui/button";
import { Card, CardHeader, PageHeader } from "@/shared/ui/card";
import { cn } from "@/shared/ui/cn";
import { SystemGlyph } from "@/shared/ui/system-glyph";
import { useOrigin } from "@/shared/ui/use-client";
import { useApi } from "@/shared/ui/use-api";
import { useStaff } from "../app-shell";
import type { FindingItem } from "../map-types";
import { FindingsPanel } from "./findings-panel";
import { KeysPanel } from "./keys-panel";
import { ThisComputerPanel } from "./this-computer";

const EXTENSION_BROWSERS = ["chrome", "edge", "brave", "vivaldi"] as const;

function DownloadTile({ href, mark, title, meta, action, sameOrigin }: { href: string; mark: ReactNode; title: string; meta: string; action: string; sameOrigin?: boolean }) {
  return (
    <a
      href={href}
      download={sameOrigin ? "" : undefined}
      className="group flex items-center gap-4 rounded-panel border border-line bg-surface p-4 transition duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-float"
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-sunken transition-transform duration-300 group-hover:scale-105">{mark}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold leading-5 text-ink">{title}</span>
        <span className="block text-xs text-muted">{meta}</span>
      </span>
      <span className={buttonClasses("primary", "sm", "pointer-events-none")}>
        <Download className="size-4 transition-transform duration-200 group-hover:translate-y-0.5" />
        <span className="hidden sm:inline">{action}</span>
      </span>
    </a>
  );
}

/**
 * Download & connect: the installers and the browser extension, this computer (desktop app), the findings the agents
 * left, the extension's keys, and how to set it all up.
 */
export function ConnectManager({ desktop, agentAddress, downloads }: { desktop: boolean; agentAddress: string | null; downloads: Downloads }) {
  const { t } = useI18n();
  const { can } = useStaff();
  const origin = useOrigin();
  const findings = useApi<FindingItem[]>("/api/connect/findings");
  // The extension reaches the desktop app on its fixed local port; the web app at its own address.
  const address = desktop ? agentAddress : origin;

  const extensionTile = (
    <DownloadTile
      href={downloads.extension}
      sameOrigin
      mark={
        <span className="grid grid-cols-2 gap-0.5">
          {EXTENSION_BROWSERS.map((browser) => (
            <Image key={browser} src={`/brands/browsers/${browser}.svg`} alt="" width={16} height={16} unoptimized draggable={false} className="size-4" />
          ))}
        </span>
      }
      title={t("connect.extensionTitle")}
      meta={t("connect.extensionMeta")}
      action={t("connect.extensionButton")}
    />
  );

  return (
    <>
      <PageHeader title={t("connect.title")} description={desktop ? t("connect.subtitleDesktop") : t("connect.subtitle")} />
      <section aria-label={t("connect.downloads")}>
        <div className={cn("grid gap-3", desktop ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-3")}>
          {desktop ? null : (
            <>
              <DownloadTile
                href={downloads.windows}
                mark={<SystemGlyph system="windows" className="size-6 text-[#0078d4]" />}
                title={t("connect.windowsTitle")}
                meta={t("connect.windowsMeta")}
                action={t("connect.windowsButton")}
              />
              <DownloadTile
                href={downloads.linux}
                mark={<SystemGlyph system="linux" className="size-7 text-ink" />}
                title={t("connect.linuxTitle")}
                meta={t("connect.linuxMeta")}
                action={t("connect.linuxButton")}
              />
            </>
          )}
          {extensionTile}
        </div>
        {desktop ? null : (
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
            <span>{t("connect.macosSoon")}</span>
            <a href={downloads.releases} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-muted hover:text-ink">
              {t("connect.allReleases")}
              <ArrowUpRight className="size-3" />
            </a>
          </p>
        )}
      </section>

      <div className="mt-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="min-w-0 space-y-5">
          {desktop ? <ThisComputerPanel onScanned={findings.reload} /> : null}
          <FindingsPanel findings={findings} />
        </div>
        <div className="min-w-0 space-y-5">
          {can("settings.manage") ? <KeysPanel address={address} /> : null}
          <InstallSteps desktop={desktop} address={address} />
        </div>
      </div>
    </>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-2.5">
      {items.map((item, index) => (
        <li key={index} className="flex gap-3 text-[13px] leading-5 text-ink-2">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-[11px] font-bold text-accent">{index + 1}</span>
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ol>
  );
}

const code = (text: string) => <code className="rounded bg-sunken px-1 py-0.5 font-mono text-[12px] text-ink">{text}</code>;

/** The full setup: the extension (every browser profile), and AkunMu Desktop with its first-run hurdles. */
function InstallSteps({ desktop, address }: { desktop: boolean; address: string | null }) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader title={t("connect.installTitle")} />
      <div className="space-y-5 p-4">
        <Steps
          items={[
            t("connect.stepUnzip"),
            <>
              {t("connect.stepOpenPage")} {code("chrome://extensions")} · {code("edge://extensions")} · {code("brave://extensions")}
            </>,
            t("connect.stepDeveloper"),
            t("connect.stepLoad"),
            t("connect.stepKey"),
            <>
              {t("connect.stepConnect")}
              {address ? <> {code(address)}</> : null}
            </>,
            t("connect.stepEveryProfile"),
            t("connect.stepReports"),
          ]}
        />
        {desktop ? null : (
          <div className="border-t border-line pt-4">
            <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-faint">{t("connect.desktopTitle")}</p>
            <Steps items={[t("connect.desktopInstall"), <>{t("connect.desktopLinux")} {code("sudo chown root:root chrome-sandbox && sudo chmod 4755 chrome-sandbox")}</>, t("connect.desktopScan"), t("connect.desktopOpen")]} />
          </div>
        )}
        <p className="flex gap-2 rounded-xl bg-subtle px-3 py-2.5 text-xs leading-5 text-muted">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ok-ink" />
          {t("connect.privacy")}
        </p>
      </div>
    </Card>
  );
}
