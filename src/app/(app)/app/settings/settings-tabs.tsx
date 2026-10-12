"use client";

import { Building2, Fingerprint, ShieldCheck, Sparkles, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Permission } from "@/modules/users/permissions";
import { useI18n } from "@/shared/i18n/client";
import { cn } from "@/shared/ui/cn";
import { useStaff } from "../app-shell";

/** One page per tab, so a settings page never grows into a long scroll. "My data" is for everyone. */
const TABS: { href: string; labelKey: string; icon: LucideIcon; permission?: Permission }[] = [
  { href: "/app/settings", labelKey: "settings.tabWorkspace", icon: Building2, permission: "settings.manage" },
  { href: "/app/settings/privacy", labelKey: "settings.tabPrivacy", icon: ShieldCheck, permission: "settings.manage" },
  { href: "/app/settings/ai", labelKey: "settings.tabAi", icon: Sparkles, permission: "settings.manage" },
  { href: "/app/settings/users", labelKey: "settings.tabUsers", icon: Users, permission: "users.manage" },
  { href: "/app/settings/data", labelKey: "settings.tabData", icon: Fingerprint },
];

export function SettingsTabs() {
  const { t } = useI18n();
  const { can } = useStaff();
  const pathname = usePathname();
  return (
    <div className="-mx-3 overflow-x-auto border-b border-line px-3 sm:mx-0 sm:px-0">
      <nav aria-label={t("settings.title")} className="flex min-w-max gap-1">
        {TABS.filter((tab) => !tab.permission || can(tab.permission)).map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors",
                active ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink",
              )}
            >
              <tab.icon className="size-4" />
              {t.dynamic(tab.labelKey)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
