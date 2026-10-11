import { timingSafeEqual } from "node:crypto";
import type { DesktopDefaults, DesktopMode } from "@/modules/desktop/service";
import { desktopToken } from "@/shared/env";
import { getI18n } from "@/shared/i18n/server";

/** The names the desktop app's two people and its workspace start with, in the app's language. */
export async function desktopDefaults(): Promise<DesktopDefaults> {
  const { t } = await getI18n();
  return { userName: t("desktop.userName"), superadminName: t("desktop.superadminName"), workspace: t("desktop.workspaceName") };
}

export function desktopModeParam(value: string | null): DesktopMode {
  return value === "superadmin" ? "superadmin" : "user";
}

/** Whether a request carries the desktop shell's key for this launch (compared in constant time; never outside the desktop app). */
export function isLaunchKey(given: string | null): boolean {
  const expected = desktopToken();
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
