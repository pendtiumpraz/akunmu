import type { Metadata } from "next";
import { requireStaffPage } from "@/server/staff-page";
import { getI18n } from "@/shared/i18n/server";
import { SignInMap, type MapSelection } from "./sign-in-map";
import type { TreeFocus } from "./tree/tree-canvas";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.map") };
}

function idOf(value: string | string[] | undefined): number | null {
  return typeof value === "string" && /^\d{1,12}$/.test(value) ? Number(value) : null;
}

/**
 * The sign-in map. It opens on the account trees; `?view=columns` (or a `?device`, `?place` or `?account` to open)
 * shows the columns devices → places → accounts, `?view=check` the list to check, and `?record=1` the record drawer.
 */
export default async function MapPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaffPage("map.read");
  const params = await searchParams;
  const place = typeof params.place === "string" && /^(p:\d{1,12}|a:.{1,60}|d)$/.test(params.place) ? params.place : null;
  const deviceId = idOf(params.device);
  const accountId = idOf(params.account);
  const columns = params.view === "columns" || params.view === "map" || deviceId !== null || place !== null || accountId !== null;
  const initial: MapSelection = { deviceId, place, accountId, view: params.view === "check" ? "check" : columns ? "map" : "tree" };
  // ?tree=device-<id> or ?tree=account-<id> opens the trees framed on that device or account.
  const focus = typeof params.tree === "string" ? /^(device|account)-(\d{1,12})$/.exec(params.tree) : null;
  const treeFocus: TreeFocus | null = focus ? { kind: focus[1] as TreeFocus["kind"], id: Number(focus[2]) } : null;
  return <SignInMap initial={treeFocus ? { ...initial, view: "tree" } : initial} startRecording={params.record === "1"} treeFocus={treeFocus} />;
}
