import { Building2, Clock3, PauseCircle, Sparkles } from "lucide-react";
import Link from "next/link";
import { requirePlatformPage } from "@/server/staff-page";
import { listTenantsForPlatform, tenantStatusCounts } from "@/modules/tenants/service";
import { getI18n } from "@/shared/i18n/server";
import { Badge, type BadgeTone } from "@/shared/ui/badge";
import { Card, CardHeader, PageHeader, StatCard } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/feedback";

const STATUS_TONE: Record<string, BadgeTone> = { trial: "warn", active: "ok", suspended: "danger", cancelled: "neutral" };

/** Platform overview: workspaces by status and the newest ones. */
export default async function PlatformOverviewPage() {
  await requirePlatformPage();
  const [{ t, format }, counts, recent] = await Promise.all([getI18n(), tenantStatusCounts(), listTenantsForPlatform({ page: 1, perPage: 6 })]);
  const total = counts.trial + counts.active + counts.suspended + counts.cancelled;

  return (
    <>
      <PageHeader title={t("platform.overviewTitle")} description={t("platform.overviewSubtitle")} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("platform.statTotal")} value={format.number(total)} icon={<Building2 className="size-5" />} tone="accent" />
        <StatCard label={t("platform.statActive")} value={format.number(counts.active)} icon={<Sparkles className="size-5" />} tone="ok" />
        <StatCard label={t("platform.statTrial")} value={format.number(counts.trial)} icon={<Clock3 className="size-5" />} tone="warn" />
        <StatCard label={t("platform.statSuspended")} value={format.number(counts.suspended)} icon={<PauseCircle className="size-5" />} tone="danger" />
      </div>
      <Card className="mt-6">
        <CardHeader
          title={t("platform.recentTitle")}
          action={
            <Link href="/platform/tenants" className="text-sm font-semibold text-accent hover:underline">
              {t("platform.viewAll")}
            </Link>
          }
        />
        {recent.items.length === 0 ? (
          <EmptyState icon={<Building2 className="size-6" />} title={t("platform.recentEmpty")} />
        ) : (
          <ul className="divide-y divide-line">
            {recent.items.map((tenant) => (
              <li key={tenant.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{tenant.name}</p>
                  <p className="truncate font-mono text-xs text-muted">{tenant.slug}</p>
                </div>
                <div className="flex items-center gap-3 text-[13px] text-muted">
                  <span>{t("platform.deviceCount", { count: tenant.deviceCount })}</span>
                  <Badge tone={STATUS_TONE[tenant.status]} dot>
                    {t.dynamic(`platform.status_${tenant.status}`)}
                  </Badge>
                  <span className="hidden sm:inline">{format.date(tenant.createdAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
