import type { DesktopDefaults, DesktopMode } from "@/modules/desktop/service";
import { getI18n } from "@/shared/i18n/server";

/** The names the desktop app's two people and its workspace start with, in the app's language. */
export async function desktopDefaults(): Promise<DesktopDefaults> {
  const { t } = await getI18n();
  return { userName: t("desktop.userName"), superadminName: t("desktop.superadminName"), workspace: t("desktop.workspaceName") };
}

export function desktopModeParam(value: string | null): DesktopMode {
  return value === "superadmin" ? "superadmin" : "user";
}
