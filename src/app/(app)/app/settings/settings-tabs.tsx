"use client";

import { Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/shared/i18n/client";
import { cn } from "@/shared/ui/cn";
import { useStaff } from "../app-shell";

const TABS = [
  { href: "/app/settings", labelKey: "settings.tabAi", icon: Sparkles, permission: "settings.manage" },
  { href: "/app/settings/users", labelKey: "settings.tabUsers", icon: Users, permission: "users.manage" },
] as const;

export function SettingsTabs() {
  const { t } = useI18n();
  const { can } = useStaff();
  const pathname = usePathname();
  return (
    <nav aria-label={t("settings.title")} className="flex gap-1 border-b border-line">
      {TABS.filter((tab) => can(tab.permission)).map((tab) => {
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
  );
}
