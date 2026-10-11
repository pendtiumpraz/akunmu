"use client";

import { ArrowLeftRight, AtSign, Boxes, ChevronDown, Laptop, LogOut, Plug, Search, Settings, Sparkles, TreeDeciduous, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { DesktopMode } from "@/modules/desktop/service";
import type { Permission } from "@/modules/users/permissions";
import type { StaffRole } from "@/modules/users/roles";
import { api } from "@/shared/http/client";
import { useI18n } from "@/shared/i18n/client";
import { cn } from "@/shared/ui/cn";
import { LocaleSwitcher } from "@/shared/ui/locale-switcher";
import { LogoMark } from "@/shared/ui/logo";
import { ThemeToggle } from "@/shared/ui/theme";
import { CommandPalette, useCommandPalette } from "./command-palette";

type ShellUser = { name: string; email: string; role: StaffRole };

/**
 * One solid color per menu icon (loop-v5 rule #6): the icon keeps its color on the dark rail, hovering dims it
 * (opacity 0.8) and the active item shows it 20% lighter.
 */
export type ShellNavItem = { href: string; labelKey: string; icon: LucideIcon; color: string; permission?: Permission; exact?: boolean };

const NAV: ShellNavItem[] = [
  { href: "/app", labelKey: "nav.map", icon: TreeDeciduous, color: "#34D399", exact: true },
  { href: "/app/devices", labelKey: "nav.devices", icon: Laptop, color: "#3B82F6" },
  { href: "/app/accounts", labelKey: "nav.accounts", icon: AtSign, color: "#F59E0B" },
  { href: "/app/providers", labelKey: "nav.providers", icon: Boxes, color: "#A855F7" },
  { href: "/app/assistant", labelKey: "nav.assistant", icon: Sparkles, color: "#EC4899" },
];

const FOOTER_NAV: ShellNavItem[] = [
  { href: "/app/connect", labelKey: "nav.connect", icon: Plug, color: "#22D3EE", permission: "map.read" },
  { href: "/app/settings", labelKey: "nav.settings", icon: Settings, color: "#94A3B8", permission: "settings.manage" },
];

const ROLE_KEYS: Record<StaffRole, string> = { admin: "roles.admin", editor: "roles.editor", viewer: "roles.viewer" };

const StaffContext = createContext<{ user: ShellUser; permissions: Permission[]; desktop: boolean } | null>(null);

/** Current staff user and permissions for client components inside the app, and whether this is the desktop app. */
export function useStaff() {
  const value = useContext(StaffContext);
  if (!value) throw new Error("useStaff must be used inside AppShell.");
  return { ...value, can: (permission: Permission) => value.permissions.includes(permission) };
}

export function initials(name: string): string {
  return name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function iconColor(item: ShellNavItem, active: boolean): string {
  return active ? `color-mix(in srgb, ${item.color} 80%, white)` : item.color;
}

function RailLink({ item, active }: { item: ShellNavItem; active: boolean }) {
  const { t } = useI18n();
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex w-[70px] flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold leading-3 transition-colors",
        active ? "bg-rail-active text-white" : "text-rail-ink hover:bg-rail-hover hover:text-white",
      )}
    >
      <item.icon className="size-5 transition-[opacity,transform] duration-200 group-hover:scale-110 group-hover:opacity-80 group-active:scale-95" style={{ color: iconColor(item, active) }} strokeWidth={2.2} />
      <span className="max-w-full truncate">{t.dynamic(item.labelKey)}</span>
    </Link>
  );
}

/**
 * The app frame: a slim dark rail of colored icons (desktop), a top bar with search (Ctrl/⌘ K), theme,
 * language and the user menu, and a bottom tab bar on phones. The platform console passes its own `nav`.
 */
export function AppShell({
  user,
  permissions,
  children,
  nav = NAV,
  footerNav = FOOTER_NAV,
  homeHref = "/app",
  caption,
  search = true,
  canSignOut = true,
  switchMode,
  desktop = false,
}: {
  user: ShellUser;
  permissions: Permission[];
  children: ReactNode;
  nav?: ShellNavItem[];
  footerNav?: ShellNavItem[];
  homeHref?: string;
  caption?: string;
  search?: boolean;
  /** False in the desktop app, which signs its people in by itself. */
  canSignOut?: boolean;
  /** The desktop app's other mode, offered in the user menu (src/app/desktop/mode). */
  switchMode?: DesktopMode;
  /** The desktop app: it can open browser profiles of its own computer. */
  desktop?: boolean;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const palette = useCommandPalette(search);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const allowed = (item: ShellNavItem) => !item.permission || permissions.includes(item.permission);
  const items = nav.filter(allowed);
  const footerItems = footerNav.filter(allowed);
  const isActive = (item: ShellNavItem) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));
  const current = [...items, ...footerItems].find(isActive);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const signOut = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/login");
    router.refresh();
  };

  return (
    <StaffContext.Provider value={{ user, permissions, desktop }}>
      <div className="min-h-dvh bg-canvas">
        <aside className="print-hidden fixed inset-y-0 left-0 z-30 hidden w-[82px] flex-col items-center bg-rail py-3 md:flex">
          <Link href={homeHref} aria-label={caption ?? t("nav.home")} className="mb-4 rounded-xl transition-opacity hover:opacity-80">
            <LogoMark className="size-9" />
          </Link>
          <nav aria-label={t("nav.main")} className="flex flex-1 flex-col items-center gap-1">
            {items.map((item) => (
              <RailLink key={item.href} item={item} active={isActive(item)} />
            ))}
          </nav>
          <div className="flex flex-col items-center gap-1">
            {footerItems.map((item) => (
              <RailLink key={item.href} item={item} active={isActive(item)} />
            ))}
          </div>
        </aside>

        <div className="md:pl-[82px]">
          <header className="print-hidden sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface/85 px-3 backdrop-blur sm:px-5">
            <Link href={homeHref} className="flex min-w-0 items-center gap-2 md:hidden">
              <LogoMark className="size-7" />
            </Link>
            <div className="min-w-0 flex-1 md:flex-none">
              {caption ? <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-faint">{caption}</p> : null}
              <p className="truncate text-sm font-bold leading-5 text-ink">{current ? t.dynamic(current.labelKey) : ""}</p>
            </div>
            {search ? (
              <button
                type="button"
                onClick={palette.open}
                className="hidden h-9 w-full max-w-md items-center gap-2 rounded-lg border border-line bg-subtle px-3 text-left text-[13px] text-faint transition-colors hover:border-line-strong md:mx-auto md:flex"
              >
                <Search className="size-4 shrink-0" />
                <span className="flex-1 truncate">{t("palette.placeholder")}</span>
                <kbd className="rounded border border-line bg-surface px-1.5 font-mono text-[11px] text-muted">{palette.shortcut}</kbd>
              </button>
            ) : (
              <div className="hidden flex-1 md:block" />
            )}
            <div className="ml-auto flex items-center gap-0.5 md:ml-0">
              {search ? (
                <button
                  type="button"
                  onClick={palette.open}
                  aria-label={t("palette.open")}
                  className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-subtle hover:text-ink md:hidden"
                >
                  <Search className="size-4" />
                </button>
              ) : null}
              <ThemeToggle />
              <div className="hidden sm:block">
                <LocaleSwitcher />
              </div>
              <div ref={menuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((value) => !value)}
                  aria-expanded={menuOpen}
                  aria-label={t("nav.account")}
                  className="flex items-center gap-1.5 rounded-lg p-1 hover:bg-subtle"
                >
                  <span className="flex size-7 items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">{initials(user.name)}</span>
                  <ChevronDown className="hidden size-3.5 text-faint sm:block" />
                </button>
                {menuOpen ? (
                  <div className="absolute right-0 top-full mt-2 w-64 animate-pop rounded-xl border border-line bg-surface p-1.5 shadow-float">
                    <div className="px-3 py-2">
                      <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
                      <p className="truncate font-mono text-xs text-muted">{user.email}</p>
                      <p className="mt-1 text-xs font-medium text-faint">{t.dynamic(ROLE_KEYS[user.role])}</p>
                    </div>
                    <div className="my-1 border-t border-line" />
                    <LocaleSwitcher className="w-full justify-start px-3 sm:hidden" />
                    {footerItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-subtle"
                      >
                        <item.icon className="size-4" style={{ color: item.color }} />
                        {t.dynamic(item.labelKey)}
                      </Link>
                    ))}
                    {switchMode ? (
                      // A full page load: the route switches the session and redirects.
                      <a
                        href={`/desktop/mode?to=${switchMode}`}
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-ink-2 hover:bg-subtle"
                      >
                        <ArrowLeftRight className="size-4 text-accent" />
                        {switchMode === "superadmin" ? t("desktop.toSuperadmin") : t("desktop.toUser")}
                      </a>
                    ) : null}
                    {canSignOut ? (
                      <button type="button" onClick={signOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger-ink hover:bg-danger-soft">
                        <LogOut className="size-4" />
                        {t("nav.signOut")}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-[1440px] px-3 pb-24 pt-5 sm:px-5 md:pb-10 lg:px-8">{children}</main>
        </div>

        <nav
          aria-label={t("nav.main")}
          className="print-hidden fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
          style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
        >
          {items.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn("flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-semibold", active ? "text-ink" : "text-muted")}
              >
                <item.icon className="size-5" style={{ color: item.color, opacity: active ? 1 : 0.75 }} strokeWidth={2.2} />
                <span className="max-w-full truncate px-1">{t.dynamic(item.labelKey)}</span>
              </Link>
            );
          })}
        </nav>
        {search ? <CommandPalette state={palette} /> : null}
      </div>
    </StaffContext.Provider>
  );
}
