"use client";

import { Building2, MapPin, ShieldCheck } from "lucide-react";
import { useI18n } from "@/shared/i18n/client";
import { PageHeader } from "@/shared/ui/card";
import { TabBar, useUrlTab, type TabItem } from "@/shared/ui/tabs";
import { PrivacySettings } from "../../../(app)/app/settings/privacy/privacy-settings";

const TABS = ["operator", "privacy", "locations"] as const;
type Tab = (typeof TABS)[number];

/** Platform console settings: the operator's identity, its privacy officer and retention, and data locations. */
export function PlatformSettingsTabs({ initialTab }: { initialTab: string | null }) {
  const { t } = useI18n();
  const [tab, setTab] = useUrlTab(TABS, initialTab as Tab | null);
  const tabs: TabItem<Tab>[] = [
    { key: "operator", label: t("platformSettings.tabOperator"), icon: <Building2 className="size-4" /> },
    { key: "privacy", label: t("platformSettings.tabPrivacy"), icon: <ShieldCheck className="size-4" /> },
    { key: "locations", label: t("platformSettings.tabLocations"), icon: <MapPin className="size-4" /> },
  ];
  const endpoint = "/api/platform/settings/privacy";
  return (
    <>
      <PageHeader title={t("platformSettings.title")} description={t("platformSettings.subtitle")} />
      <TabBar tabs={tabs} active={tab} onSelect={setTab} />
      <div className="mt-5" role="tabpanel">
        {tab === "operator" ? (
          <PrivacySettings key="operator" endpoint={endpoint} blocks={["operator"]} title={t("platformSettings.operatorTitle")} subtitle={t("platformSettings.operatorSubtitle")} />
        ) : null}
        {tab === "privacy" ? (
          <PrivacySettings key="privacy" endpoint={endpoint} blocks={["officer", "pic", "retentionPlatform"]} title={t("platformSettings.privacyTitle")} subtitle={t("platformSettings.privacySubtitle")} />
        ) : null}
        {tab === "locations" ? (
          <PrivacySettings key="locations" endpoint={endpoint} blocks={["locations"]} title={t("platformSettings.locationsTitle")} subtitle={t("platformSettings.locationsSubtitle")} />
        ) : null}
      </div>
    </>
  );
}
