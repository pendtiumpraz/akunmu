"use client";

import { Building2, LayoutDashboard, Scale, Settings, ShieldCheck, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import type { StaffRole } from "@/modules/users/roles";
import { useI18n } from "@/shared/i18n/client";
import { AppShell, type ShellNavItem } from "../../(app)/app/app-shell";

/** Platform console menu (AkunMu owner and support staff): one solid color per icon. */
const PLATFORM_NAV: ShellNavItem[] = [
  { href: "/platform", labelKey: "platform.navOverview", icon: LayoutDashboard, color: "#14B8A6", exact: true },
  { href: "/platform/tenants", labelKey: "platform.navTenants", icon: Building2, color: "#3B82F6" },
  { href: "/platform/staff", labelKey: "platform.navStaff", icon: ShieldCheck, color: "#A855F7" },
  { href: "/platform/ai", labelKey: "platform.navAi", icon: Sparkles, color: "#EC4899" },
  { href: "/platform/privacy", labelKey: "platform.navPrivacy", icon: Scale, color: "#818CF8" },
];

const PLATFORM_FOOTER_NAV: ShellNavItem[] = [{ href: "/platform/settings", labelKey: "platform.navSettings", icon: Settings, color: "#94A3B8" }];

/** In the desktop app the console is the superadmin mode: no sign-out, and a way back to the user mode. */
export function PlatformShell({ user, desktop = false, children }: { user: { name: string; email: string; role: StaffRole }; desktop?: boolean; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <AppShell
      user={user}
      permissions={[]}
      nav={PLATFORM_NAV}
      footerNav={PLATFORM_FOOTER_NAV}
      homeHref="/platform"
      caption={t("platform.consoleCaption")}
      search={false}
      canSignOut={!desktop}
      switchMode={desktop ? "user" : undefined}
    >
      {children}
    </AppShell>
  );
}
