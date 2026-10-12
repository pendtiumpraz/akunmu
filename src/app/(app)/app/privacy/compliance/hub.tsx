"use client";

import { ClipboardList, FileCheck2, Inbox, Settings, ShieldCheck, Siren, Timer } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useI18n } from "@/shared/i18n/client";
import { buttonClasses } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/card";
import { cn } from "@/shared/ui/cn";
import { TabBar, useUrlTab, type TabItem } from "@/shared/ui/tabs";
import { useApi } from "@/shared/ui/use-api";
import { DpiaList } from "./dpia-list";
import { IncidentsList } from "./incidents-list";
import { RequestsList } from "./requests-list";
import { RopaList } from "./ropa-list";
import type { ComplianceArea } from "./shared";

const TABS = ["ropa", "dpia", "requests", "incidents"] as const;
type HubTab = (typeof TABS)[number];

type Overview = {
  activities: number;
  incomplete: number;
  dpiaRequired: number;
  dpiaMissing: number;
  dpiaApproved: number;
  openRequests: number;
  overdueIncidents: number;
  profile: { dpo: boolean; address: boolean };
  retention: boolean;
};

function Tile({ icon, label, value, note, warn, onClick, href }: { icon: ReactNode; label: string; value: ReactNode; note: string; warn: boolean; onClick?: () => void; href?: string }) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium leading-4 text-muted">{label}</span>
        <span className={cn("flex size-7 items-center justify-center rounded-lg", warn ? "bg-warn-soft text-warn-ink" : "bg-ok-soft text-ok-ink")}>{icon}</span>
      </span>
      <span className="mt-1 block text-xl font-bold tracking-tight text-ink">{value}</span>
      <span className={cn("mt-0.5 line-clamp-2 block text-xs leading-4", warn ? "font-medium text-warn-ink" : "text-muted")}>{note}</span>
    </>
  );
  // A column from the top: a button would center its content, so tiles with longer notes would not line up.
  const className = "flex h-full flex-col rounded-panel border border-line bg-surface p-4 text-left shadow-card transition-colors hover:border-line-strong";
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}

/**
 * The privacy compliance area (UU PDP and PP 33/2026): records of processing activities, DPIAs, data subject
 * requests and the breach register, as tabs under one overview of what still needs work.
 */
export function PrivacyHub({ area, initialTab, settingsHref }: { area: ComplianceArea; initialTab: string | null; settingsHref: string }) {
  const { t } = useI18n();
  const [tab, setTab] = useUrlTab<HubTab>(TABS, initialTab as HubTab | null);
  const overview = useApi<Overview>(`${area.api}/overview`);
  const data = overview.data;

  const tabs: TabItem<HubTab>[] = [
    { key: "ropa" as const, label: t("privacyHub.tabRopa"), icon: <ClipboardList className="size-4" /> },
    { key: "dpia" as const, label: t("privacyHub.tabDpia"), icon: <FileCheck2 className="size-4" /> },
    { key: "requests" as const, label: t("privacyHub.tabRequests"), icon: <Inbox className="size-4" /> },
    { key: "incidents" as const, label: t("privacyHub.tabIncidents"), icon: <Siren className="size-4" /> },
  ];

  return (
    <>
      <PageHeader
        title={area.scope === "platform" ? t("privacyHub.platformTitle") : t("privacyHub.title")}
        description={area.scope === "platform" ? t("privacyHub.platformSubtitle") : t("privacyHub.subtitle")}
        actions={
          <Link href={settingsHref} className={buttonClasses("secondary", "sm")}>
            <Settings className="size-4" />
            {t("privacyHub.settings")}
          </Link>
        }
      />
      {data ? (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Tile
            icon={<ClipboardList className="size-4" />}
            label={t("privacyHub.tileActivities")}
            value={data.activities}
            note={data.incomplete > 0 ? t("privacyHub.tileIncomplete", { count: data.incomplete }) : t("privacyHub.tileAllComplete")}
            warn={data.incomplete > 0}
            onClick={() => setTab("ropa")}
          />
          <Tile
            icon={<FileCheck2 className="size-4" />}
            label={t("privacyHub.tileDpia")}
            value={`${data.dpiaApproved}/${data.dpiaRequired}`}
            note={data.dpiaMissing > 0 ? t("privacyHub.tileDpiaMissing", { count: data.dpiaMissing }) : t("privacyHub.tileDpiaOk")}
            warn={data.dpiaMissing > 0}
            onClick={() => setTab("dpia")}
          />
          <Tile
            icon={<Inbox className="size-4" />}
            label={t("privacyHub.tileRequests")}
            value={data.openRequests}
            note={t("privacyHub.tileRequestsNote")}
            warn={data.openRequests > 0}
            onClick={() => setTab("requests")}
          />
          <Tile
            icon={<Siren className="size-4" />}
            label={t("privacyHub.tileIncidents")}
            value={data.overdueIncidents}
            note={data.overdueIncidents > 0 ? t("privacyHub.tileIncidentsOverdue") : t("privacyHub.tileIncidentsOk")}
            warn={data.overdueIncidents > 0}
            onClick={() => setTab("incidents")}
          />
          <Tile
            icon={<ShieldCheck className="size-4" />}
            label={t("privacyHub.tileDpo")}
            value={data.profile.dpo ? t("privacyHub.set") : t("privacyHub.notSet")}
            note={t("privacyHub.tileDpoNote")}
            warn={!data.profile.dpo}
            href={settingsHref}
          />
          <Tile
            icon={<Timer className="size-4" />}
            label={t("privacyHub.tileRetention")}
            value={data.retention ? t("privacyHub.set") : t("privacyHub.notSet")}
            note={t("privacyHub.tileRetentionNote")}
            warn={!data.retention}
            href={settingsHref}
          />
        </div>
      ) : (
        <div className="mb-6 h-[104px] animate-pulse rounded-panel bg-sunken" />
      )}
      <TabBar tabs={tabs} active={tab} onSelect={setTab} />
      <div className="mt-5" role="tabpanel">
        {tab === "ropa" ? <RopaList area={area} /> : null}
        {tab === "dpia" ? <DpiaList area={area} /> : null}
        {tab === "requests" ? <RequestsList area={area} /> : null}
        {tab === "incidents" ? <IncidentsList area={area} /> : null}
      </div>
    </>
  );
}
